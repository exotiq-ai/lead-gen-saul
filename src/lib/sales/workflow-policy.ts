import { z } from 'zod'
export type Row=Record<string,unknown>
export interface SalesMatch {lookup_id:string;status:'no_match'|'possible_match'|'existing_review_required'|'already_working'|'request_pending';expires_at:string}
export interface RelationshipEvent {id:string;event_type:string;created_at:string;payload:Record<string,unknown>}
export interface SalesRelationship {id:string;company_name:string;contact_name:string;relationship_note:string;last_contact_at:string|null;last_contact_summary:string;status:'pending'|'information_requested'|'approved'|'declined'|'withdrawn';submitted_at:string;updated_at:string;submitted_by_name:string;decision_note:string|null;reviewed_at:string|null;events:RelationshipEvent[];submitted_by_member_id?:string;lead_id?:string|null;candidate_lead_ids?:string[];internal_note?:string|null}
export interface SalesReviewContext {candidates:Array<{lead_id:string;company_name:string;status:string;current_owner:string;review_version:string;ghl_contact_linked:boolean;protected:boolean;activities:Array<{activity_type:string;channel:string|null;created_at:string;summary:string}>}>;coverage:Record<string,string>}
export interface SalesNotification {id:string;title:string;body:string;created_at:string;read_at:string|null;lead_id:string|null;relationship_request_id:string|null}
export interface TimelineItem {id:string;event_type:string;created_at:string;note?:string;next_action?:string;status?:string}
const opt=(max:number)=>z.string().trim().max(max).optional().default('')
const website=opt(300).refine(v=>{if(!v)return true;try{const u=new URL(v.includes('://')?v:`https://${v}`);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&u.hostname.includes('.')}catch{return false}},'Use a valid http(s) website')
export const matchInput=z.object({company_name:z.string().trim().min(2).max(180),email:opt(254).refine(v=>!v||z.email().safeParse(v).success,'Use a valid email'),phone:opt(40).refine(v=>!v||(/^[+()\d\s.-]+$/.test(v)&&v.replace(/\D/g,'').length>=10&&v.replace(/\D/g,'').length<=15),'Use a full phone number'),website}).strict().refine(v=>Boolean(v.email||v.phone||v.website),'Add phone, website or email')
const evidence={relationship_note:z.string().trim().min(3).max(2000),last_contact_at:z.iso.date().nullable().optional().default(null),last_contact_summary:z.string().trim().min(3).max(2000)}
export const relationshipInput=z.object({request_id:z.uuid(),lookup_id:z.uuid(),contact_name:z.string().trim().min(2).max(160),...evidence}).strict()
export const respondInput=z.discriminatedUnion('action',[z.object({action:z.literal('respond'),...evidence}).strict(),z.object({action:z.literal('withdraw')}).strict()])
const nextOwner=z.enum(['account_owner','gregory','unassigned'])
export const relationshipReviewInput=z.object({decision:z.enum(['approved','declined','information_requested']),decision_note:z.string().trim().min(3).max(1000),internal_note:opt(2000),lead_id:z.uuid().optional(),review_version:z.string().min(1).max(100).optional(),founder_assist:z.enum(['none','active']).optional(),handoff_summary:z.string().trim().min(3).max(2000).optional(),next_action:z.string().trim().min(3).max(1000).optional(),next_action_due_at:z.iso.datetime({offset:true}).optional(),next_action_owner:nextOwner.optional(),external_clearance_confirmed:z.boolean().optional()}).strict().refine(v=>v.decision!=='approved'||Boolean(v.lead_id&&v.review_version&&v.handoff_summary&&v.next_action&&v.next_action_due_at&&v.external_clearance_confirmed),'Approval requires current account context, a handoff summary, next action/due date, and manual external review')
export const workInput=z.object({next_action:z.string().trim().max(1000).optional(),next_action_due_at:z.iso.datetime({offset:true}).nullable().optional(),outcome_note:z.string().trim().max(2000).optional(),next_action_owner:nextOwner.optional(),founder_assist:z.enum(['none','requested','active']).optional(),status:z.enum(['new','engaged','qualified','converted','lost','disqualified']).optional()}).strict().refine(v=>Object.keys(v).length>0,'Choose an update')
const text=(v:unknown)=>typeof v==='string'?v:''
const nullable=(v:unknown)=>typeof v==='string'?v:null
export function projectRelationship(row:Row,admin:boolean,events:Row[]=[]):SalesRelationship{
 const r:SalesRelationship={id:text(row.id),company_name:text(row.company_name),contact_name:text(row.contact_name),relationship_note:text(row.relationship_note),last_contact_at:nullable(row.last_contact_at),last_contact_summary:text(row.last_contact_summary),status:row.status as SalesRelationship['status'],submitted_at:text(row.submitted_at),updated_at:text(row.updated_at),submitted_by_name:text(row.submitted_by_name),decision_note:nullable(row.decision_note),reviewed_at:nullable(row.reviewed_at),events:events.map(e=>{
  const p=(e.payload??{}) as Row;const safe:Row={};for(const key of ['public_note','relationship_note','last_contact_at','last_contact_summary','status'])if(Object.hasOwn(p,key))safe[key]=p[key]
  if(admin&&Object.hasOwn(p,'internal_note'))safe.internal_note=p.internal_note
  return {id:text(e.id),event_type:text(e.event_type),created_at:text(e.created_at),payload:safe}
 })}
 if(admin){r.submitted_by_member_id=text(row.submitted_by_member_id);r.lead_id=nullable(row.lead_id);r.candidate_lead_ids=Array.isArray(row.candidate_lead_ids)?row.candidate_lead_ids.map(String):[];r.internal_note=nullable(row.internal_note)}
 return r
}
export function projectNotification(row:Row,admin:boolean,owned:Set<string>,ownRequests:Set<string>):SalesNotification{
 const lead=nullable(row.lead_id),request=nullable(row.relationship_request_id)
 return {id:text(row.id),title:text(row.title),body:text(row.body),created_at:text(row.created_at),read_at:nullable(row.read_at),lead_id:lead&&(admin||owned.has(lead))?lead:null,relationship_request_id:request&&(admin||ownRequests.has(request))?request:null}
}
export function projectTimeline(rows:Row[],admin:boolean,userId:string):TimelineItem[]{
 return rows.filter(e=>admin||(e.payload as Row)?.visibility==='shared'||e.actor_user_id===userId).slice(0,20).map(e=>{const p=(e.payload??{})as Row;return {id:text(e.id),event_type:text(e.event_type),created_at:text(e.created_at),...(typeof p.note==='string'?{note:p.note}:{}),...(typeof p.next_action==='string'?{next_action:p.next_action}:{}),...(typeof p.status==='string'?{status:p.status}:{})}})
}
