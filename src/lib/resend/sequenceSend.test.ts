import assert from 'node:assert/strict'
import test from 'node:test'
import { canSendSequenceEmail } from './sequenceSend'

test('demo email can only go to the exact allowlisted address when demo sending is enabled', () => {
  const env = { EXOTIQ_SEQUENCE_DEMO_EMAIL: 'gregory.ringler@gmail.com', EXOTIQ_SEQUENCE_DEMO_SEND_ENABLED: 'true' }
  assert.equal(canSendSequenceEmail({ to: 'Gregory.Ringler@gmail.com', mode: 'demo' }, env), true)
  assert.equal(canSendSequenceEmail({ to: 'customer@example.com', mode: 'demo' }, env), false)
  assert.equal(canSendSequenceEmail({ to: 'gregory.ringler@gmail.com', mode: 'live' }, env), false)
})

test('live email requires both independent customer send gates', () => {
  assert.equal(canSendSequenceEmail({ to: 'customer@example.com', mode: 'live' }, { OUTREACH_LIVE_SENDS_ENABLED: 'true', RESEND_OUTBOUND_DRY_RUN: 'false' }), true)
  assert.equal(canSendSequenceEmail({ to: 'customer@example.com', mode: 'live' }, { OUTREACH_LIVE_SENDS_ENABLED: 'false', RESEND_OUTBOUND_DRY_RUN: 'false' }), false)
  assert.equal(canSendSequenceEmail({ to: 'customer@example.com', mode: 'live' }, { OUTREACH_LIVE_SENDS_ENABLED: 'true', RESEND_OUTBOUND_DRY_RUN: 'true' }), false)
})
