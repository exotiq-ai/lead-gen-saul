import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

test('magic-link email uses cross-device token-hash confirmation', () => {
  const route = path.join(process.cwd(), 'src/app/auth/confirm/route.ts')
  const template = path.join(process.cwd(), 'supabase/templates/magic-link.html')
  assert.equal(fs.existsSync(route), true, 'token-hash confirmation route must exist')
  const routeSource = fs.readFileSync(route, 'utf8')
  const templateSource = fs.readFileSync(template, 'utf8')
  assert.match(routeSource, /token_hash/)
  assert.match(routeSource, /verifyOtp/)
  assert.match(routeSource, /isAllowedDashboardAdmin/)
  assert.match(templateSource, /\/auth\/confirm\?token_hash=\{\{ \.TokenHash \}\}/)
  assert.doesNotMatch(templateSource, /\{\{ \.ConfirmationURL \}\}/)
})
