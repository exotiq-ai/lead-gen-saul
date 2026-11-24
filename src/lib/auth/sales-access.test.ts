import assert from 'node:assert/strict'
import test from 'node:test'
import * as policy from './policy'

test('safe redirects accept only the standalone sales workspace or exact dashboard boundary', () => {
  assert.equal(policy.safeRedirectPath('/sales'), '/sales')
  assert.equal(policy.safeRedirectPath('/sales?tab=receipts'), '/sales?tab=receipts')
  for (const p of ['/sales-evil', '/dashboard-evil', '/dashboard/../../api/settings', '/dashboard\\evil', '//evil.test']) {
    assert.equal(policy.safeRedirectPath(p), '/dashboard', p)
  }
})

test('partner routing grants only the standalone workspace and dedicated API family', () => {
  assert.equal(typeof policy.isSalesWorkspacePath, 'function')
  assert.equal(policy.isSalesWorkspacePath('/sales'), true)
  assert.equal(policy.isSalesWorkspacePath('/api/sales/workspace'), true)
  for (const p of ['/sales-evil', '/api/sales-evil', '/dashboard', '/api/leads', '/api/tenants', '/api/exports', '/api/settings', '/api/outreach']) {
    assert.equal(policy.isSalesWorkspacePath(p), false, p)
  }
})

test('verified active member maps only to the fixed tenant and does not become admin', () => {
  assert.equal(typeof policy.resolveSalesIdentity, 'function')
  const user = {id:'user-1',email:'Rep@Example.test',email_confirmed_at:'2026-01-01'}
  const member = {id:'member-1',email:'rep@example.test',display_name:'Rep',team:'starr',active:true,tenant_id:'00000000-0000-0000-0000-000000000001'}
  const actor = policy.resolveSalesIdentity(user,member,[])
  assert.equal(actor?.isAdmin,false)
  assert.equal(actor?.memberId,'member-1')
  assert.equal(policy.resolveSalesIdentity({...user,email_confirmed_at:null},member,[]),null)
  assert.equal(policy.resolveSalesIdentity(user,{...member,active:false},[]),null)
  assert.equal(policy.resolveSalesIdentity(user,{...member,email:'other@example.test'},[]),null)
  assert.equal(policy.resolveSalesIdentity(user,{...member,tenant_id:'22222222-2222-2222-2222-222222222222'},[]),null)
  assert.equal(policy.resolveSalesIdentity(user,null,[]),null)
})

test('only the existing server admin allowlist establishes admin role', () => {
  assert.equal(typeof policy.resolveSalesIdentity, 'function')
  const actor = policy.resolveSalesIdentity({id:'admin-1',email:'gregory@exotiq.ai',email_confirmed_at:'2026-01-01'},null,['gregory@exotiq.ai'])
  assert.equal(actor?.isAdmin,true)
  assert.equal(actor?.memberId,null)
})

test('mutations reject cross-origin and absent browser-origin proof, allow safe reads', () => {
  assert.equal(typeof policy.isSameOriginSalesRequest, 'function')
  assert.equal(policy.isSameOriginSalesRequest('GET',null,'https://leadsbysaul.netlify.app'),true)
  assert.equal(policy.isSameOriginSalesRequest('POST','https://leadsbysaul.netlify.app','https://leadsbysaul.netlify.app'),true)
  assert.equal(policy.isSameOriginSalesRequest('POST','https://evil.test','https://leadsbysaul.netlify.app'),false)
  assert.equal(policy.isSameOriginSalesRequest('PATCH',null,'https://leadsbysaul.netlify.app'),false)
})
