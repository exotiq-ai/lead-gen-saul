import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migrationPath = path.join(process.cwd(), 'supabase/migrations/013_exotiq_gtm_safety_foundation.sql')

test('GTM safety migration defines durable campaign, send, event, evidence, claims, and suppression contracts', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration must exist')
  const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase()
  for (const table of [
    'outreach_campaign_versions',
    'outreach_send_attempts',
    'outreach_events',
    'outreach_suppressions',
    'lead_evidence',
    'approved_claims',
  ]) {
    assert.match(sql, new RegExp(`create table(?: if not exists)? ${table}`))
  }
  assert.match(sql, /idempotency_key/)
  assert.match(sql, /provider_message_id/)
  assert.match(sql, /unique[^;]+provider[^;]+event/i)
  assert.match(sql, /scope/)
  assert.match(sql, /reason/)
})
