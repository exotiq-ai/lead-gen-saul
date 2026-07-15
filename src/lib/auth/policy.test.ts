import assert from 'node:assert/strict'
import test from 'node:test'
import {
  allowedDashboardEmails,
  isAllowedDashboardAdmin,
  safeRedirectPath,
  resolvePublicOrigin,
} from './policy'

test('dashboard login allowlist normalizes configured emails', () => {
  assert.deepEqual(allowedDashboardEmails(' Gregory@Exotiq.ai, hello@exotiq.ai '), ['gregory@exotiq.ai', 'hello@exotiq.ai'])
})

test('only explicitly allowed admin emails pass', () => {
  const allowlist = ['gregory@exotiq.ai']
  assert.equal(isAllowedDashboardAdmin('Gregory@Exotiq.ai', allowlist), true)
  assert.equal(isAllowedDashboardAdmin('attacker@example.com', allowlist), false)
  assert.equal(isAllowedDashboardAdmin(null, allowlist), false)
})

test('post-login redirects stay on the local dashboard', () => {
  assert.equal(safeRedirectPath('/dashboard/outreach?tenant=exotiq'), '/dashboard/outreach?tenant=exotiq')
  assert.equal(safeRedirectPath('https://evil.example/phish'), '/dashboard')
  assert.equal(safeRedirectPath('//evil.example/phish'), '/dashboard')
  assert.equal(safeRedirectPath('/api/outreach/queue'), '/dashboard')
})

test('public origin prefers local forwarded host during QA and configured URL in production', () => {
  assert.equal(resolvePublicOrigin({ configuredUrl: 'https://leadsbysaul.netlify.app', forwardedHost: 'localhost:8888', forwardedProto: 'http', requestOrigin: 'http://localhost:3000' }), 'http://localhost:8888')
  assert.equal(resolvePublicOrigin({ configuredUrl: 'https://leadsbysaul.netlify.app', forwardedHost: 'leadsbysaul.netlify.app', forwardedProto: 'https', requestOrigin: 'http://localhost:3000' }), 'https://leadsbysaul.netlify.app')
})
