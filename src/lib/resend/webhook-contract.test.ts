import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

test('Resend webhook route verifies raw Svix signature and uses durable event/suppression tables', () => {
  const route = path.join(process.cwd(), 'src/app/api/webhooks/resend/route.ts')
  assert.equal(fs.existsSync(route), true, 'Resend webhook route must exist')
  const source = fs.readFileSync(route, 'utf8')
  assert.match(source, /RESEND_WEBHOOK_SECRET/)
  assert.match(source, /svix-id/)
  assert.match(source, /outreach_events/)
  assert.match(source, /outreach_send_attempts/)
  assert.match(source, /outreach_suppressions/)
  assert.doesNotMatch(source, /\.from\(['"]leads['"]\)\s*\.insert/)
})
