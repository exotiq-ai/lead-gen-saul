import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { requireSalesActor } from '@/lib/sales/auth'
import { accountSchema, EXOTIQ_TENANT, identityMatches, memberAccessSchema, memberSchema, projectRegistration, reviewSchema, submissionSchema } from '@/lib/sales/model'
import { matchInput, relationshipInput, relationshipReviewInput, respondInput, workInput, projectRelationship, projectNotification, projectTimeline } from '@/lib/sales/workflow-policy'
import type { SalesActor, SalesAccount, SalesEvent, SalesMember } from '@/lib/sales/types'
export const runtime='nodejs'
export const dynamic='force-dynamic'
type Row=Record<string,unknown>
const PAGE_SIZE=50
class HttpError extends Error {constructor(message:string,public status=400){super(message)}}
function response(body:unknown,status:number,authResponse?:NextResponse){const res=NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});for(const cookie of authResponse?.cookies.getAll()??[])res.cookies.set(cookie);return res}
async function readRows(table:string,fields:string,filters:Record<string,string|string[]|null>={}){
 const db=createServerClient();const rows:Row[]=[];let count:number|null=null
 const order=table==='sales_account_assignments'||table==='sales_baseline_accounts'?'lead_id':'id'
 for(let offset=0;offset<20000;offset+=500){
  let q=db.from(table).select(fields,{count:'exact'}).eq('tenant_id',EXOTIQ_TENANT).order(order).range(offset,offset+499)
  for(const [key,value]of Object.entries(filters))q=value===null?q.is(key,null):Array.isArray(value)?q.in(key,value):q.eq(key,value)
  const result=await q;if(result.error)throw result.error
  if(count!==null&&count!==result.count)throw new HttpError('Records changed during loading. Refresh to continue.',409)
  count=result.count;if(count===null)throw new HttpError('Record coverage could not be verified',503)
  rows.push(...(result.data as unknown as Row[]??[]));if(rows.length===count)return rows
  if(!result.data?.length)throw new HttpError('Incomplete record read. Refresh to continue.',503)
 }
 throw new HttpError('Workspace exceeds the current read bound; administrator review required',503)
}
function pageNumber(req:NextRequest,key:string){const value=Number(req.nextUrl.searchParams.get(key)??1);if(!Number.isInteger(value)||value<1||value>10000)throw new HttpError('Invalid page');return value}
async function workspace(req:NextRequest,actor:SalesActor){
 const ap=pageNumber(req,'account_page'),rp=pageNumber(req,'registration_page'),relp=pageNumber(req,'relationship_page')
 const db=createServerClient()
 const [members,registrations,assignments,baselines,baselineRows,relationships]=await Promise.all([
  readRows('sales_members','id,email,display_name,team,active',actor.isAdmin?{}:{id:actor.memberId!}),
  readRows('sales_registrations','*',actor.isAdmin?{}:{submitted_by_user_id:actor.userId}),
  readRows('sales_account_assignments','*',actor.isAdmin?{}:{assigned_member_id:actor.memberId!}),
  actor.isAdmin?readRows('sales_baseline_snapshots','id,captured_at,lead_count,exception_count,manifest_sha256'):Promise.resolve([]),
  readRows('sales_baseline_accounts','snapshot_id,lead_id,source_review_required'),
  readRows('sales_relationship_requests','*',actor.isAdmin?{}:{submitted_by_member_id:actor.memberId!}),
 ])
 const leadFields='id,company_name,first_name,last_name,email,phone,company_domain,status,source,assigned_to,updated_at'
 let leads:Row[]=[]
 if(actor.isAdmin)leads=await readRows('leads',leadFields)
 else for(let i=0;i<assignments.length;i+=75)leads.push(...await readRows('leads',leadFields,{id:assignments.slice(i,i+75).map(r=>String(r.lead_id))}))
 const assignmentMap=new Map(assignments.map(r=>[r.lead_id,r])),memberMap=new Map(members.map(r=>[r.id,r]))
 const baselineMap=new Map<string,boolean>();for(const b of baselineRows)baselineMap.set(String(b.lead_id),Boolean(b.source_review_required)||Boolean(baselineMap.get(String(b.lead_id))))
 let accounts:SalesAccount[]=leads.map(l=>{
  const a=assignmentMap.get(l.id),m=memberMap.get(a?.assigned_member_id)
  return {lead_id:String(l.id),company_name:String(l.company_name??'Unnamed operator'),contact_name:[l.first_name,l.last_name].filter(Boolean).join(' ')||null,email:l.email as string|null,phone:l.phone as string|null,website:l.company_domain as string|null,status:String(l.status),assigned_member_id:(a?.assigned_member_id??null)as string|null,assigned_name:a?.ownership_overridden?(m?String(m.display_name):null):(l.assigned_to?String(l.assigned_to):null),source_label:baselineMap.has(String(l.id))?(baselineMap.get(String(l.id))?'Review source':'Exotiq existing'):(l.source==='partner_submission'?'Partner submitted':'Source not reviewed'),next_action:(a?.next_action??null)as string|null,next_action_due_at:(a?.next_action_due_at??null)as string|null,updated_at:String(a?.updated_at??l.updated_at),founder_assist:String(a?.founder_assist??'none')as SalesAccount['founder_assist'],next_action_owner:String(a?.next_action_owner??'account_owner')as SalesAccount['next_action_owner'],handoff_summary:(a?.handoff_summary??null)as string|null,sales_outreach_hold:Boolean(a?.sales_outreach_hold)}
 }).sort((a,b)=>a.company_name.localeCompare(b.company_name)||a.lead_id.localeCompare(b.lead_id))
 const now=Date.now();const work_summary={followups_due:accounts.filter(a=>a.next_action_due_at&&new Date(a.next_action_due_at).getTime()<=now&&!['converted','lost','disqualified'].includes(a.status)).length,founder_requests:accounts.filter(a=>a.founder_assist==='requested').length}
 const query=(req.nextUrl.searchParams.get('q')??'').trim().toLowerCase().slice(0,200)
 if(query)accounts=accounts.filter(a=>[a.company_name,a.contact_name,a.email,a.phone,a.website].some(v=>v?.toLowerCase().includes(query)))
 if(req.nextUrl.searchParams.get('due')==='1')accounts=accounts.filter(a=>a.next_action_due_at&&new Date(a.next_action_due_at).getTime()<=now&&!['converted','lost','disqualified'].includes(a.status))
 registrations.sort((a,b)=>String(b.submitted_at).localeCompare(String(a.submitted_at))||String(a.id).localeCompare(String(b.id)))
 relationships.sort((a,b)=>String(b.submitted_at).localeCompare(String(a.submitted_at))||String(a.id).localeCompare(String(b.id)))
 const visible=registrations.slice((rp-1)*PAGE_SIZE,rp*PAGE_SIZE),visibleAccounts=accounts.slice((ap-1)*PAGE_SIZE,ap*PAGE_SIZE),visibleRelations=relationships.slice((relp-1)*25,relp*25)
 const [events,relationshipEvents]=await Promise.all([
  visible.length?readRows('sales_registration_events','id,registration_id,event_type,created_at,actor_user_id,payload',{registration_id:visible.map(r=>String(r.id))}):Promise.resolve([]),
  visibleRelations.length?readRows('sales_relationship_events','id,relationship_request_id,event_type,created_at,actor_user_id,payload',{relationship_request_id:visibleRelations.map(r=>String(r.id))}):Promise.resolve([]),
 ])
 let timelineRows:Row[]=[]
 if(visibleAccounts.length){const r=await db.from('sales_registration_events').select('id,lead_id,event_type,created_at,actor_user_id,payload').eq('tenant_id',EXOTIQ_TENANT).in('lead_id',visibleAccounts.map(a=>a.lead_id)).order('created_at',{ascending:false}).limit(500);if(r.error)throw r.error;timelineRows=r.data??[]}
 const receipts=visible.map(r=>{const receipt=projectRegistration(r,actor.isAdmin,events.filter(e=>e.registration_id===r.id).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)))as unknown as SalesEvent[]);if(actor.isAdmin)receipt.candidate_accounts=leads.filter(l=>identityMatches(r,l)!=='none').map(l=>({id:String(l.id),company_name:String(l.company_name)}));return receipt})
 let nq=db.from('sales_notifications').select('id,title,body,lead_id,relationship_request_id,created_at,read_at').eq('tenant_id',EXOTIQ_TENANT).order('created_at',{ascending:false}).limit(30)
 nq=actor.isAdmin?nq.is('recipient_member_id',null):nq.eq('recipient_member_id',actor.memberId!)
 const notifications=await nq;if(notifications.error)throw notifications.error
 const owned=new Set(assignments.filter(a=>a.assigned_member_id===actor.memberId).map(a=>String(a.lead_id))),ownRequests=new Set(relationships.filter(r=>r.submitted_by_member_id===actor.memberId).map(r=>String(r.id)))
 return {actor,members:members as unknown as SalesMember[],registrations:receipts,accounts:visibleAccounts.map(a=>({...a,timeline:projectTimeline(timelineRows.filter(e=>e.lead_id===a.lead_id),actor.isAdmin,actor.userId)})),baselines,
  relationships:visibleRelations.map(r=>projectRelationship(r,actor.isAdmin,relationshipEvents.filter(e=>e.relationship_request_id===r.id).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))))),
  notifications:(notifications.data??[]).map(r=>projectNotification(r,actor.isAdmin,owned,ownRequests)),
  review_summary:{pending:relationships.filter(r=>r.status==='pending').length,information_requested:relationships.filter(r=>r.status==='information_requested').length,overdue:relationships.filter(r=>['pending','information_requested'].includes(String(r.status))&&now-new Date(String(r.updated_at)).getTime()>86400000).length},work_summary,
  relationship_meta:{total:relationships.length,page:relp,page_size:25},meta:{accounts_total:accounts.length,registrations_total:registrations.length,account_page:ap,registration_page:rp,page_size:PAGE_SIZE}}
}
async function body(req:NextRequest){if(Number(req.headers.get('content-length'))>16000)throw new HttpError('Request too large',413);const raw=await req.text();if(raw.length>16000)throw new HttpError('Request too large',413);try{return JSON.parse(raw)}catch{throw new HttpError('Invalid JSON')}}
function validId(v:string){if(!z.uuid().safeParse(v).success)throw new HttpError('Invalid identifier');return v}
async function handle(req:NextRequest){
 const auth=await requireSalesActor(req);if('error'in auth)return auth.error
 const {actor}=auth;const parts=req.nextUrl.pathname.slice('/api/sales/'.length).split('/').filter(Boolean)
 try{
  if(req.method==='GET'&&parts.join('/')==='workspace')return response(await workspace(req,actor),200,auth.response)
  const db=createServerClient();const admin=()=>{if(!actor.isAdmin)throw new HttpError('Administrator access required',403)}
  let rpc:string,args:Record<string,unknown>,kind:'member'|'registration'|'account'|'match'|'relationship'|'context'|'notification'
  if(req.method==='POST'&&parts.join('/')==='matches'){
   rpc='sales_match';args={p_actor:actor,p_input:matchInput.parse(await body(req))};kind='match'
  }else if(req.method==='POST'&&parts.join('/')==='relationships'){
   rpc='sales_relationship_submit';args={p_actor:actor,p_input:relationshipInput.parse(await body(req))};kind='relationship'
  }else if(parts.length===3&&parts[0]==='relationships'&&parts[2]==='context'&&req.method==='GET'){
   admin();rpc='sales_relationship_context';args={p_actor:actor,p_request_id:validId(parts[1])};kind='context'
  }else if(parts.length===3&&parts[0]==='relationships'&&parts[2]==='review'&&req.method==='POST'){
   admin();rpc='sales_relationship_review';args={p_actor:actor,p_request_id:validId(parts[1]),p_input:relationshipReviewInput.parse(await body(req))};kind='relationship'
  }else if(parts.length===3&&parts[0]==='relationships'&&parts[2]==='respond'&&req.method==='POST'){
   rpc='sales_relationship_respond';args={p_actor:actor,p_request_id:validId(parts[1]),p_input:respondInput.parse(await body(req))};kind='relationship'
  }else if(parts.length===3&&parts[0]==='accounts'&&parts[2]==='work'&&req.method==='PATCH'){
   const input=workInput.parse(await body(req));if(!actor.isAdmin&&(input.status&&['new','converted','disqualified'].includes(input.status)||input.founder_assist&&input.founder_assist!=='requested'))throw new HttpError('Administrator approval required',403)
   rpc='sales_work_update';args={p_actor:actor,p_lead_id:validId(parts[1]),p_input:input};kind='account'
  }else if(parts.length===2&&parts[0]==='notifications'&&req.method==='PATCH'){
   z.object({}).strict().parse(await body(req));rpc='sales_notification_read';args={p_actor:actor,p_notification_id:validId(parts[1])};kind='notification'
  }else if(req.method==='POST'&&parts.join('/')==='registrations'){
   rpc='sales_submit';args={p_actor:actor,p_input:submissionSchema.parse(await body(req))};kind='registration'
  }else if(req.method==='POST'&&parts.length===3&&parts[0]==='registrations'&&parts[2]==='review'){
   admin();rpc='sales_review';args={p_actor:actor,p_registration_id:validId(parts[1]),p_input:reviewSchema.parse(await body(req))};kind='registration'
  }else if(req.method==='POST'&&parts.join('/')==='members'){
   admin();rpc='sales_member_write';args={p_actor:actor,p_member_id:null,p_input:memberSchema.parse(await body(req))};kind='member'
  }else if(req.method==='PATCH'&&parts.length===2&&parts[0]==='members'){
   admin();rpc='sales_member_write';args={p_actor:actor,p_member_id:validId(parts[1]),p_input:memberAccessSchema.parse(await body(req))};kind='member'
  }else if(req.method==='PATCH'&&parts.length===2&&parts[0]==='accounts'){
   const input=accountSchema.parse(await body(req));if(Object.hasOwn(input,'assigned_member_id'))admin()
   rpc='sales_update_account';args={p_actor:actor,p_lead_id:validId(parts[1]),p_input:input};kind='account'
  }else throw new HttpError('Not found',404)
  const result=await db.rpc(rpc,args);if(result.error)throw result.error
  let value:unknown=result.data
  if(kind==='registration')value=projectRegistration(result.data,actor.isAdmin,[])
  if(kind==='relationship')value=projectRelationship(result.data,actor.isAdmin)
  // Mutation acknowledgements never return links that may no longer be visible.
  if(kind==='notification')value={id:result.data.id,read_at:result.data.read_at}
  return response({[kind]:value},200,auth.response)
 }catch(error){
  if(error instanceof z.ZodError)return response({error:error.issues[0]?.message??'Invalid request'},400,auth.response)
  if(error instanceof HttpError)return response({error:error.message},error.status,auth.response)
  const e=error as {code?:string;message?:string}
  if(e.code==='P0001')return response({error:e.message??'Change rejected'},e.message?.includes('rate limit')?429:409,auth.response)
  if(e.code==='23505')return response({error:'This record already exists. Refresh before continuing.'},409,auth.response)
  console.error('[sales]',e.code??'unknown')
  return response({error:'Team workspace is unavailable. An administrator must verify database setup.'},503,auth.response)
 }
}
export const GET=handle
export const POST=handle
export const PATCH=handle
