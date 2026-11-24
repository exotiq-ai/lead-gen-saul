import { z } from 'zod'
import type { SalesEvent, SalesRegistration } from './types'
export const EXOTIQ_TENANT='00000000-0000-0000-0000-000000000001'
const optionalText=(max:number)=>z.string().trim().max(max).optional().default('')
const website=z.string().trim().max(300).optional().default('').refine(v=>{
 if(!v)return true
 try{const u=new URL(v.includes('://')?v:`https://${v}`);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&u.hostname.includes('.')&&!/[\s:]/.test(u.hostname)}catch{return false}
},'Use a valid http(s) website')
export const submissionSchema=z.object({request_id:z.uuid(),company_name:z.string().trim().min(2).max(180),contact_name:optionalText(160),email:optionalText(254).refine(v=>!v||z.email().safeParse(v).success,'Use a valid email'),phone:optionalText(40).refine(v=>!v||(/^[+()\d\s.-]+$/.test(v)&&v.replace(/\D/g,'').length>=10&&v.replace(/\D/g,'').length<=15),'Use a full phone number'),website,relationship_note:optionalText(2000)}).strict().refine(v=>Boolean(v.email||v.phone||v.website),'Add an email, phone or website')
export const reviewSchema=z.object({decision:z.enum(['accepted','declined']),reason:z.string().trim().min(3).max(1000),lead_id:z.uuid().optional(),assigned_member_id:z.uuid().optional(),confirmed_distinct:z.boolean().optional()}).strict()
export const memberSchema=z.object({email:z.email().transform(v=>v.toLowerCase().trim()),display_name:z.string().trim().min(2).max(100),team:z.literal('starr')}).strict()
export const memberAccessSchema=z.object({active:z.boolean()}).strict()
export const accountSchema=z.object({next_action:z.string().trim().max(1000).optional(),next_action_due_at:z.union([z.iso.datetime({offset:true}),z.literal(''),z.null()]).optional(),outcome_note:z.string().trim().max(2000).optional(),assigned_member_id:z.uuid().nullable().optional(),reason:z.string().trim().min(3).max(1000).optional()}).strict().refine(v=>Object.keys(v).length>0,'Choose an update').refine(v=>!Object.hasOwn(v,'assigned_member_id')||Boolean(v.reason),'Provide a handoff reason')
export function domain(v:unknown){if(typeof v!=='string'||!v.trim())return '';try{return new URL(v.includes('://')?v:`https://${v}`).hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,'')}catch{return ''}}
export function phone(v:unknown){const d=String(v??'').replace(/\D/g,'');return d.length===11&&d.startsWith('1')?d.slice(1):d}
export function identityMatches(a:Record<string,unknown>,b:Record<string,unknown>):'existing'|'possible'|'none'{
 const email=String(a.email??'').trim().toLowerCase(),p=phone(a.phone),d=domain(a.website??a.company_domain)
 if((email&&email===String(b.email??'').trim().toLowerCase())||(p&&p===phone(b.phone))||(d&&d===domain(b.website??b.company_domain)))return 'existing'
 const n=(v:unknown)=>String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'')
 return n(a.company_name)&&n(a.company_name)===n(b.company_name)?'possible':'none'
}
export function salesContextRow(lead:Record<string,unknown>,baselines:Record<string,unknown>[],assignments:Record<string,unknown>[],members:Record<string,unknown>[]):Record<string,unknown>{
 const baseline=baselines.filter(b=>b.lead_id===lead.id),a=assignments.find(a=>a.lead_id===lead.id),m=members.find(m=>m.id===a?.assigned_member_id)
 return {...lead,sales_managed:Boolean(a?.ownership_overridden),sales_owner_name:a?.ownership_overridden?(m?.display_name??null):(lead.assigned_to??null),sales_source_label:baseline.length?(baseline.some(b=>b.source_review_required)?'Review source':'Exotiq existing'):(lead.source==='partner_submission'?'Partner submitted':'Source not reviewed')}
}
export function projectRegistration(r:Record<string,unknown>,admin:boolean,events:SalesEvent[]):SalesRegistration{
 const keys=['id','company_name','contact_name','email','phone','website','relationship_note','submitted_at','submitted_by_name','submitted_by_member_id','status','match_kind','lead_id','reviewed_at','decision_reason']
 const out=Object.fromEntries(keys.map(k=>[k,r[k]??null]))
 if(admin)out.candidate_lead_ids=r.candidate_lead_ids??[]
 out.events=events.map(e=>({id:e.id,event_type:e.event_type,created_at:e.created_at,actor_user_id:e.actor_user_id,payload:{...(e.payload.status?{status:e.payload.status}:{}),...(e.payload.reason?{reason:e.payload.reason}:{}),...(e.payload.match_kind?{match_kind:e.payload.match_kind}:{})}}))
 return out as unknown as SalesRegistration
}
