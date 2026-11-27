import { test, expect } from '@playwright/test'
const member={id:'bbbbbbbb-0000-4000-8000-000000000001',email:'rep@example.test',display_name:'Test Rep',team:'starr',active:true}
const account={lead_id:'dddddddd-0000-4000-8000-000000000001',company_name:'Synthetic Assigned Fleet',contact_name:'Test Owner',email:'owner@example.test',phone:'+13055551234',website:'example.test',status:'new',assigned_member_id:member.id,assigned_name:'Test Rep',source_label:'Partner submitted',next_action:null,next_action_due_at:null,updated_at:'2026-01-01T12:00:00Z'}
const receipt={id:'cccccccc-0000-4000-8000-000000000001',company_name:'Synthetic Submitted Fleet',contact_name:'',email:'owner@submitted.invalid',phone:'',website:'submitted.invalid',relationship_note:'',status:'pending',match_kind:'none',submitted_at:'2026-01-01T12:00:00Z',submitted_by_name:'Test Rep',submitted_by_member_id:member.id,reviewed_at:null,decision_reason:null as string|null,lead_id:null,events:[],candidate_accounts:[]}
async function mock(page:import('@playwright/test').Page,admin=false,failFirst=false){
 const writes:{url:string;body:Record<string,unknown>}[]=[]
 const data={actor:{userId:'aaaaaaaa-0000-4000-8000-000000000001',email:admin?'admin@example.test':member.email,displayName:admin?'Admin':'Test Rep',isAdmin:admin,memberId:admin?null:member.id,team:admin?null:'starr',tenantId:'00000000-0000-0000-0000-000000000001'},members:[member],registrations:admin?[receipt]:[],accounts:[account],baselines:admin?[{id:'baseline',captured_at:'2026-01-01T12:00:00Z',lead_count:1,exception_count:0,manifest_sha256:'a'.repeat(64)}]:[],meta:{accounts_total:1,registrations_total:admin?1:0,account_page:1,registration_page:1,page_size:50}}
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.pathname==='/api/sales/workspace')return route.fulfill({json:data})
  if(url.pathname==='/api/sales/matches')return route.fulfill({json:{match:{lookup_id:'eeeeeeee-0000-4000-8000-000000000001',status:'no_match',expires_at:'2030-01-01T12:00:00Z'}}})
  if(req.method()!=='GET'){
   const body=req.postDataJSON();writes.push({url:url.pathname,body})
   if(url.pathname==='/api/sales/registrations'){
    if(failFirst&&writes.length===1)return route.fulfill({status:503,json:{error:'Temporary failure. Retry.'}})
    data.registrations=[{...receipt,...body}];data.meta.registrations_total=1
    return route.fulfill({json:{registration:data.registrations[0]}})
   }
   if(url.pathname.includes('/review')){data.registrations=[{...receipt,status:String(body.decision),decision_reason:String(body.reason)}];return route.fulfill({json:{registration:data.registrations[0]}})}
   if(url.pathname.includes('/accounts/'))return route.fulfill({json:{account:{...account,...body}}})
   if(url.pathname==='/api/sales/members')return route.fulfill({json:{member:{...member,...body}}})
  }
  if(url.pathname==='/api/tenants')return route.fulfill({json:{data:[{id:'00000000-0000-0000-0000-000000000001',name:'Exotiq',slug:'exotiq'}]}})
  return route.fulfill({json:{data:[],meta:{total:0},leads:[],tenants:[],pending_count:0}})
 })
 return writes
}
test('rep adds an operator, sees a receipt, and has no team administration controls',async({page})=>{
 const writes=await mock(page);await page.goto('/sales')
 await expect(page.getByRole('heading',{name:'My Leads',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Add Operator',exact:true}).click()
 await page.getByLabel('Business name').fill('Synthetic Submitted Fleet')
 await page.getByLabel('Website', {exact:true}).fill('submitted.invalid')
 await page.getByRole('button',{name:'Check Prospect',exact:true}).click()
 await page.getByRole('button',{name:'Submit Operator',exact:true}).click()
 await expect(page.getByRole('status').filter({hasText:'Submission saved'})).toContainText('Submission saved')
 expect(writes[0].body.request_id).toMatch(/^[0-9a-f-]{36}$/)
 expect(writes[0].body).not.toHaveProperty('submitted_by_member_id')
 await page.getByRole('button',{name:'My Submissions',exact:true}).click()
 await expect(page.getByText('Synthetic Submitted Fleet',{exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Add Rep',exact:true})).toHaveCount(0)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy()
})
test('retry preserves submission request ID and input after an error',async({page})=>{
 const writes=await mock(page,false,true);await page.goto('/sales');await page.getByRole('button',{name:'Add Operator',exact:true}).click()
 await page.getByLabel('Business name').fill('Synthetic Submitted Fleet');await page.getByLabel('Email',{exact:true}).fill('owner@submitted.invalid')
 await page.getByRole('button',{name:'Check Prospect',exact:true}).click()
 await page.getByRole('button',{name:'Submit Operator',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Temporary failure'})).toContainText('Temporary failure')
 await expect(page.getByLabel('Business name')).toHaveValue('Synthetic Submitted Fleet')
 await page.getByRole('button',{name:'Submit Operator',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Submission saved'})).toContainText('Submission saved')
 expect(writes[0].body.request_id).toBe(writes[1].body.request_id)
})
test('admin can decline with an explicit visible receipt reason',async({page})=>{
 const writes=await mock(page,true);await page.goto('/dashboard/team?tenant=exotiq')
 await expect(page.getByRole('heading',{name:'Team & Intake',exact:true})).toBeVisible()
 await page.getByLabel('Decision note').fill('Already in our active conversation')
 await page.getByRole('button',{name:'Decline',exact:true}).click()
 await expect(page.getByRole('status')).toContainText('Review saved')
 expect(writes[0].body).toMatchObject({decision:'declined',reason:'Already in our active conversation'})
})
test('rep records the next action without changing attribution',async({page})=>{
 const writes=await mock(page);await page.goto('/sales')
 await page.getByRole('button',{name:'Update Next Step',exact:true}).click()
 await page.getByLabel('Next action',{exact:true}).fill('Call the owner tomorrow')
 await page.getByRole('button',{name:'Save Next Step',exact:true}).click()
 await expect(page.getByRole('status').filter({hasText:'Next step saved'})).toContainText('Next step saved')
 expect(writes[0].body.next_action).toBe('Call the owner tomorrow');expect(writes[0].body).not.toHaveProperty('source')
})
