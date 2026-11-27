import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
const T='00000000-0000-0000-0000-000000000001'
const OTHER='22222222-2222-2222-2222-222222222222'
const migration='017_sales_lookup_and_relationship_requests.sql'
async function fixture(){
 const db=new PGlite()
 await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;")
 for(const f of ['001_core_schema.sql','003_scoring_functions.sql','006_outreach_schema.sql','013_exotiq_gtm_safety_foundation.sql','014_exotiq_sequence_automation.sql','015_partner_sales_registry.sql'])await db.exec(fs.readFileSync(path.join(process.cwd(),'supabase/migrations',f),'utf8'))
 await db.query('INSERT INTO tenants(id,name,slug) VALUES($1,$2,$3),($4,$5,$6)',[T,'Fixture','fixture',OTHER,'Other','other'])
 const file=path.join(process.cwd(),'supabase/migrations',migration)
 if(fs.existsSync(file))await db.exec(fs.readFileSync(file,'utf8'))
 const exists=await db.query<{ok:boolean}>("SELECT to_regprocedure('public.sales_match(jsonb,jsonb)') IS NOT NULL AS ok")
 assert.equal(exists.rows[0].ok,true,'private match and relationship workflow are not implemented')
 const rpc=async(name:string,...args:unknown[])=> (await db.query<{r:Record<string,unknown>}>(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args)).rows[0].r
 const admin={tenantId:T,userId:randomUUID(),email:'founder@example.invalid',displayName:'Founder',isAdmin:true,memberId:null,team:null}
 const members=[]
 for(const name of ['Joe','Rum']){const m=await rpc('sales_member_write',admin,null,{email:name.toLowerCase()+'@fixture.invalid',display_name:name,team:'starr'});members.push({...admin,isAdmin:false,memberId:m.id,displayName:name,email:m.email,userId:randomUUID(),team:'starr'})}
 return {db,rpc,admin,joe:members[0],rum:members[1]}
}
test('private lookup, later relationship claim, review freshness, handoff and shared work preserve attribution',async()=>{
 const f=await fixture();const {db,rpc,admin,joe,rum}=f
 try{
  const original=await rpc('sales_submit',joe,{request_id:randomUUID(),company_name:'Fixture Fleet',website:'fleet.invalid'})
  const accepted=await rpc('sales_review',admin,original.id,{decision:'accepted',reason:'Original source accepted'})
  const id=accepted.lead_id
  // Seed a legacy assigned account with a still-active campaign, predating the new handoff hold.
  await db.query('UPDATE sales_account_assignments SET sales_outreach_hold=false WHERE lead_id=$1',[id])
  const match=await rpc('sales_match',rum,{company_name:'Fixture Fleet',website:'https://WWW.fleet.invalid:443/fleet'})
  assert.equal(match.status,'already_working');assert.deepEqual(Object.keys(match).sort(),['expires_at','lookup_id','status'])
  const input={request_id:randomUUID(),lookup_id:match.lookup_id,contact_name:'Owner I know',relationship_note:'Existing personal business relationship',last_contact_at:null,last_contact_summary:'Asked for founder introduction'}
  await assert.rejects(()=>rpc('sales_relationship_submit',joe,input),/lookup|member/i)
  const req=await rpc('sales_relationship_submit',rum,input);assert.equal(req.status,'pending')
  assert.equal((await rpc('sales_relationship_submit',rum,input)).id,req.id)
  await assert.rejects(()=>rpc('sales_relationship_submit',rum,{...input,relationship_note:'Different'}),/replay|differ/i)
  const different=await rpc('sales_relationship_submit',rum,{...input,request_id:randomUUID()});assert.equal(different.id,req.id)
  assert.equal((await db.query('SELECT * FROM leads WHERE tenant_id=$1',[T])).rows.length,1)
  await assert.rejects(()=>rpc('sales_relationship_context',rum,req.id),/admin/i)
  await assert.rejects(()=>rpc('sales_relationship_review',rum,req.id,{decision:'approved',decision_note:'Steal'}),/admin/i)
  await rpc('sales_relationship_review',admin,req.id,{decision:'information_requested',decision_note:'When did you speak?',internal_note:'PRIVATE REVIEW'})
  await assert.rejects(()=>rpc('sales_relationship_respond',joe,req.id,{action:'respond',relationship_note:'bad',last_contact_summary:'bad'}),/owner|request|member/i)
  await rpc('sales_relationship_respond',rum,req.id,{action:'respond',relationship_note:'We met at an event',last_contact_at:null,last_contact_summary:'Owner requested introduction'})
  const ctx=await rpc('sales_relationship_context',admin,req.id)
  const candidate=(ctx.candidates as Array<Record<string,unknown>>)[0];assert.equal(candidate.lead_id,id);assert(candidate.review_version)
  const review={decision:'approved',decision_note:'You own follow-up; founder joins close',internal_note:'PRIVATE FINAL',lead_id:id,review_version:candidate.review_version,founder_assist:'active',handoff_summary:'Owner requested founder discussion',next_action:'Arrange founder call',next_action_due_at:new Date(Date.now()+86400000).toISOString(),next_action_owner:'account_owner',external_clearance_confirmed:true}
  await assert.rejects(()=>rpc('sales_relationship_review',admin,req.id,{...review,external_clearance_confirmed:false}),/external|clearance|review/i)
  // A rep's new evidence must invalidate an already-open approval, not only lead activity.
  await rpc('sales_relationship_review',admin,req.id,{decision:'information_requested',decision_note:'Confirm latest conversation'})
  await rpc('sales_relationship_respond',rum,req.id,{action:'respond',relationship_note:'Updated relationship evidence',last_contact_summary:'New information the reviewer has not seen'})
  await assert.rejects(()=>rpc('sales_relationship_review',admin,req.id,review),/context changed|refresh|stale/i)
  const evidenceFresh=await rpc('sales_relationship_context',admin,req.id)
  review.review_version=String((evidenceFresh.candidates as Array<Record<string,unknown>>)[0].review_version)
  await db.query("INSERT INTO lead_activities(tenant_id,lead_id,activity_type,metadata) VALUES($1,$2,'call_note','{\"note\":\"New founder conversation\"}')",[T,id])
  await assert.rejects(()=>rpc('sales_relationship_review',admin,req.id,review),/changed|refresh|stale/i)
  const fresh=await rpc('sales_relationship_context',admin,req.id);review.review_version=String((fresh.candidates as Array<Record<string,unknown>>)[0].review_version)
  const enrollment=randomUUID(),action=randomUUID()
  await db.query("INSERT INTO outreach_sequence_enrollments(id,tenant_id,lead_id,sequence_key,sequence_version,mode,batch_key,route,status) VALUES($1,$2,$3,'fixture',1,'live','fixture','email','active')",[enrollment,T,id])
  await db.query("INSERT INTO outreach_sequence_actions(id,tenant_id,enrollment_id,lead_id,step_key,step_ordinal,action_kind,label,due_at,idempotency_key,status) VALUES($1,$2,$3,$4,'email1',1,'email','Test',now(),'fixture','pending')",[action,T,enrollment,id])
  const done=await rpc('sales_relationship_review',admin,req.id,review);assert.equal(done.status,'approved')
  assert.equal((await rpc('sales_relationship_review',admin,req.id,review)).id,req.id)
  const row=(await db.query<{assigned_member_id:string;founder_assist:string;sales_outreach_hold:boolean}>('SELECT * FROM sales_account_assignments WHERE lead_id=$1',[id])).rows[0]
  assert.equal(row.assigned_member_id,rum.memberId);assert.equal(row.founder_assist,'active');assert.equal(row.sales_outreach_hold,true)
  assert.equal((await db.query<{status:string}>('SELECT status FROM outreach_sequence_enrollments WHERE id=$1',[enrollment])).rows[0].status,'paused')
  assert.equal((await db.query<{status:string}>('SELECT status FROM outreach_sequence_actions WHERE id=$1',[action])).rows[0].status,'cancelled')
  await assert.rejects(()=>db.query("UPDATE outreach_sequence_actions SET status='processing' WHERE id=$1",[action]),/hold|handoff/i)
  await assert.rejects(()=>db.query("UPDATE outreach_sequence_enrollments SET status='active' WHERE id=$1",[enrollment]),/hold|handoff/i)
  const lead=(await db.query<{source:string;source_detail:string}>('SELECT source,source_detail FROM leads WHERE id=$1',[id])).rows[0]
  assert.equal(lead.source,'partner_submission');assert.equal(lead.source_detail,'registration:'+original.id)
  assert.equal((await db.query('SELECT * FROM sales_registrations WHERE lead_id=$1 AND status=$2',[id,'accepted'])).rows.length,1)
  await assert.rejects(()=>rpc('sales_work_update',joe,id,{next_action:'Old owner edit'}),/assigned|owner/i)
  await rpc('sales_work_update',rum,id,{next_action:'Call together',outcome_note:'Shared note',next_action_owner:'gregory',status:'qualified'})
  assert.equal((await db.query<{status:string}>('SELECT status FROM leads WHERE id=$1',[id])).rows[0].status,'qualified')
  await assert.rejects(()=>rpc('sales_work_update',rum,id,{status:'converted'}),/admin|status|conversion/i)
  await assert.rejects(()=>rpc('sales_work_update',rum,id,{founder_assist:'active'}),/admin|assist/i)
  await assert.rejects(()=>rpc('sales_work_update',rum,id,{source:'overwrite'}),/field|input|source/i)
  const events=(await db.query<{payload:Record<string,unknown>}>("SELECT payload FROM sales_registration_events WHERE lead_id=$1 AND event_type='account_update'",[id])).rows
  assert(events.some(x=>x.payload.visibility==='shared'&&x.payload.note==='Shared note'))
  const notifications=(await db.query<{id:string;recipient_member_id:string}>('SELECT id,recipient_member_id FROM sales_notifications WHERE recipient_member_id=$1',[rum.memberId])).rows;assert(notifications.length>0)
  await assert.rejects(()=>rpc('sales_notification_read',joe,notifications[0].id),/notification|recipient|owner/i)
  assert((await rpc('sales_notification_read',rum,notifications[0].id)).read_at)
  await rpc('sales_work_update',rum,id,{status:'lost',outcome_note:'Not a fit'})
  assert.equal((await db.query<{status:string}>('SELECT status FROM leads WHERE id=$1',[id])).rows[0].status,'lost')
  await assert.rejects(()=>db.query("UPDATE sales_relationship_events SET event_type='rewritten'"),/immutable/i)
 }finally{await db.close()}
})
test('lookup is bounded, tenant scoped, expiring, and uses persisted per-member rate limits',async()=>{
 const {db,rpc,joe,rum}=await fixture()
 try{
  await db.query("INSERT INTO leads(tenant_id,company_name,company_domain,source) VALUES($1,'Other Private','private.invalid','manual')",[OTHER])
  const x=await rpc('sales_match',joe,{company_name:'Other Private',website:'private.invalid'});assert.equal(x.status,'no_match')
  await assert.rejects(()=>rpc('sales_match',{...joe,tenantId:OTHER},{company_name:'Other Private',website:'private.invalid'}),/Exotiq/i)
  for(let i=0;i<9;i++)await rpc('sales_match',joe,{company_name:'Synthetic '+i,website:'test'+i+'.invalid'})
  await assert.rejects(()=>rpc('sales_match',joe,{company_name:'Over quota',website:'over.invalid'}),/rate limit/i)
  await rpc('sales_match',rum,{company_name:'Different member',website:'different.invalid'})
  const match=await db.query<{id:string}>('SELECT id FROM sales_match_lookups WHERE member_id=$1 LIMIT 1',[rum.memberId]);await db.query("UPDATE sales_match_lookups SET expires_at=now()-interval '1 hour' WHERE id=$1",[match.rows[0].id])
  await assert.rejects(()=>rpc('sales_relationship_submit',rum,{request_id:randomUUID(),lookup_id:match.rows[0].id,contact_name:'Owner',relationship_note:'Known owner',last_contact_summary:'Conversation'}),/expired|lookup/i)
  for(const role of ['anon','authenticated']){
   for(const t of ['sales_match_lookups','sales_relationship_requests','sales_relationship_events','sales_notifications'])assert.equal((await db.query<{ok:boolean}>("SELECT has_table_privilege($1,$2,'SELECT') ok",[role,t])).rows[0].ok,false)
   const funcs=await db.query<{ok:boolean}>("SELECT has_function_privilege($1,p.oid,'EXECUTE') ok FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'sales_%'",[role]);assert(funcs.rows.every(r=>!r.ok))
  }
 }finally{await db.close()}
})
test('suppressed accounts and in-flight sending cannot be reassigned through relationship review',async()=>{
 const {db,rpc,admin,joe}=await fixture()
 try{
  const id=randomUUID();await db.query("INSERT INTO leads(id,tenant_id,company_name,company_domain,source,assigned_to,status) VALUES($1,$2,'Protected Fleet','protect.invalid','manual','gregory','engaged')",[id,T])
  const m=await rpc('sales_match',joe,{company_name:'Protected Fleet',website:'protect.invalid'});const r=await rpc('sales_relationship_submit',joe,{request_id:randomUUID(),lookup_id:m.lookup_id,contact_name:'Owner',relationship_note:'I know owner',last_contact_summary:'Recent discussion'})
  const review={decision:'approved',decision_note:'Approve owner',lead_id:id,review_version:(await rpc('sales_relationship_review_version',id,r.id)),handoff_summary:'A shared summary',next_action:'Call tomorrow',next_action_due_at:new Date(Date.now()+86400000).toISOString(),external_clearance_confirmed:true}
  // scalar SQL function is wrapped by rpc; its result is a string at runtime.
  await db.query("INSERT INTO outreach_suppressions(tenant_id,scope,normalized_value,reason,source) VALUES($1,'lead',$2,'Do not contact','test')",[T,id])
  await assert.rejects(()=>rpc('sales_relationship_review',admin,r.id,review),/protected|suppressed|hold/i)
  await db.query('DELETE FROM outreach_suppressions WHERE tenant_id=$1',[T])
  await db.query("INSERT INTO outreach_send_attempts(tenant_id,lead_id,idempotency_key,mode,provider,status) VALUES($1,$2,'inflight','live','fixture','attempting')",[T,id])
  await assert.rejects(()=>rpc('sales_relationship_review',admin,r.id,review),/sending|flight|processing/i)
  assert.equal((await db.query('SELECT * FROM sales_account_assignments WHERE lead_id=$1',[id])).rows.length,0)
 }finally{await db.close()}
})
