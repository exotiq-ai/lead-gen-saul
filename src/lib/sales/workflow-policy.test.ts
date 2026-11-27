import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
test('workflow input validation rejects privilege injection and incomplete reviews',async()=>{
 assert(fs.existsSync('src/lib/sales/workflow-policy.ts'),'workflow policy must be implemented')
 const p=await import('./workflow-policy')
 assert(p.matchInput.safeParse({company_name:'A Fleet',website:'fleet.invalid'}).success)
 assert(!p.matchInput.safeParse({company_name:'A Fleet',website:'fleet.invalid',tenant_id:'foreign'}).success)
 assert(!p.matchInput.safeParse({company_name:'A Fleet'}).success)
 assert(!p.relationshipReviewInput.safeParse({decision:'approved',decision_note:'Okay'}).success)
 assert(p.relationshipReviewInput.safeParse({decision:'information_requested',decision_note:'Please clarify'}).success)
 assert(!p.workInput.safeParse({source:'stolen'}).success)
 assert(!p.respondInput.safeParse({action:'respond'}).success)
})
test('relationship, event, notification and timeline projections never expose forbidden fields',async()=>{
 assert(fs.existsSync('src/lib/sales/workflow-policy.ts'),'workflow projections must be implemented')
 const p=await import('./workflow-policy')
 const raw={id:'r',company_name:'Own supplied business',status:'pending',internal_note:'PRIVATE',candidate_lead_ids:['secret-id'],lead_id:'secret-id',submitted_payload:{private:'PRIVATE'},review_payload:{private:'PRIVATE'},submitted_by_member_id:'member',relationship_note:'Own supplied evidence'}
 const events=[{id:'event',event_type:'reviewed',actor_user_id:'admin',created_at:'now',payload:{public_note:'Need info',internal_note:'PRIVATE',source_contacts:'PRIVATE'}}]
 const rep=p.projectRelationship(raw,false,events);const json=JSON.stringify(rep);assert(!json.includes('PRIVATE'));assert(!json.includes('secret-id'));assert(!Object.hasOwn(rep,'submitted_by_member_id'));assert.equal(rep.events[0].payload.public_note,'Need info')
 assert.equal(p.projectRelationship(raw,true,events).internal_note,'PRIVATE')
 const notice=p.projectNotification({id:'n',lead_id:'foreign-lead',relationship_request_id:'foreign-request',title:'Updated',body:'Generic',event_key:'secret',internal_note:'PRIVATE'},false,new Set(),new Set());assert.equal(notice.lead_id,null);assert.equal(notice.relationship_request_id,null);assert(!JSON.stringify(notice).includes('secret'))
 const timeline=p.projectTimeline([{id:'a',actor_user_id:'admin',payload:{note:'PRIVATE'}},{id:'b',actor_user_id:'rep',payload:{note:'Own note'}},{id:'c',actor_user_id:'admin',payload:{visibility:'shared',note:'Approved shared',internal_note:'PRIVATE'}}],false,'rep');assert.equal(timeline.length,2);assert(!JSON.stringify(timeline).includes('PRIVATE'))
})
