import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
const load=async()=>{assert(fs.existsSync('src/lib/sales/model.ts'),'sales validation/projection missing');return import('./model')}
test('intake requires a real identifier and rejects caller identity/role injection',async()=>{
 const {submissionSchema}=await load();const base={request_id:'cccccccc-0000-4000-8000-000000000001',company_name:'Fleet'}
 assert.equal(submissionSchema.safeParse(base).success,false)
 assert.equal(submissionSchema.safeParse({...base,email:'bad'}).success,false)
 assert.equal(submissionSchema.safeParse({...base,phone:'not-a-number'}).success,false)
 assert.equal(submissionSchema.safeParse({...base,website:'javascript:alert(1)'}).success,false)
 assert.equal(submissionSchema.safeParse({...base,email:'owner@example.test',isAdmin:true}).success,false)
 assert.equal(submissionSchema.safeParse({...base,email:'owner@example.test'}).success,true)
})
test('normalization finds case, www/path and US-phone equivalent candidates without merging names',async()=>{
 const {identityMatches}=await load()
 assert.equal(identityMatches({company_name:'One',website:'https://www.example.test/fleet'},{company_name:'Different',company_domain:'example.test'}),'existing')
 assert.equal(identityMatches({company_name:'One',phone:'(305) 555-1234'},{phone:'+1 305 555 1234'}),'existing')
 assert.equal(identityMatches({company_name:'Fleet Rentals'},{company_name:'Fleet-Rentals'}),'possible')
 assert.equal(identityMatches({company_name:'One'},{company_name:'Another'}),'none')
})
test('rep receipt strips candidate IDs and review internals but retains own submitted facts',async()=>{
 const {projectRegistration}=await load();const r={id:'r1',company_name:'Fleet',status:'pending',email:'own@example.test',candidate_lead_ids:['private'],submitted_payload:{secret:'hidden'},lead_id:null}
 const view=projectRegistration(r,false,[])
 assert.equal(view.email,'own@example.test');assert.equal('submitted_payload' in view,false);assert.equal('candidate_lead_ids' in view,false)
 assert.equal('candidate_lead_ids' in projectRegistration(r,true,[]),true)
})
test('legacy lead overlay preserves provenance and makes the registry owner authoritative',async()=>{
 const {salesContextRow}=await load();assert.equal(typeof salesContextRow,'function')
 const original={id:'a',source:'research',assigned_to:'gregory'}
 const row=salesContextRow(original,[{lead_id:'a',source_review_required:true}],[{lead_id:'a',assigned_member_id:'m',ownership_overridden:true}],[{id:'m',display_name:'Rep'}])
 assert.equal(row.source,'research');assert.equal(row.assigned_to,'gregory');assert.equal(row.sales_source_label,'Review source');assert.equal(row.sales_owner_name,'Rep');assert.equal(row.sales_managed,true)
 const empty=salesContextRow(original,[],[],[]);assert.equal(empty.sales_managed,false);assert.equal(empty.sales_owner_name,'gregory')
 const noted=salesContextRow(original,[],[{lead_id:'a',assigned_member_id:null,ownership_overridden:false}],[])
 assert.equal(noted.sales_owner_name,'gregory','saving a next step must not silently unassign a founder-owned account')
 assert.equal(noted.sales_managed,false)
})
test('account edit schema rejects source, tenant, and status tampering',async()=>{
 const {accountSchema}=await load();assert.equal(accountSchema.safeParse({next_action:'Call owner'}).success,true)
 for(const key of ['source','tenant_id','status','submitted_by_member_id'])assert.equal(accountSchema.safeParse({[key]:'evil'}).success,false)
 assert.equal(accountSchema.safeParse({assigned_member_id:'aaaaaaaa-0000-4000-8000-000000000001'}).success,false)
})
