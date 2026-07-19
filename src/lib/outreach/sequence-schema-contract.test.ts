import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

test('sequence migration defines durable enrollments, actions, idempotency, and due indexes', () => {
  const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/014_exotiq_sequence_automation.sql'), 'utf8')
  assert.match(migration, /CREATE TABLE IF NOT EXISTS outreach_sequence_enrollments/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS outreach_sequence_actions/)
  assert.match(migration, /UNIQUE \(tenant_id, idempotency_key\)/)
  assert.match(migration, /idx_sequence_actions_due/)
  assert.match(migration, /CHECK \(mode IN \('demo','live'\)\)/)
})
