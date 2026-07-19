import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EXOTIQ_CUSTOMER_BATCH_LIMIT,
  actionIdempotencyKey,
  scheduleSequence,
  sequenceEligibility,
  sequenceSteps,
  shouldExitSequence,
} from './sequence'

test('live sequence is email, call, Instagram, then email follow-ups on the approved timeline', () => {
  const steps = sequenceSteps('live')
  assert.deepEqual(steps.map((step) => step.key), ['email_1', 'call_1', 'instagram_1', 'email_2', 'email_3', 'email_close'])
  assert.deepEqual(steps.map((step) => step.offsetMinutes), [0, 2880, 4320, 7200, 14400, 20160])
  assert.equal(EXOTIQ_CUSTOMER_BATCH_LIMIT, 25)
})

test('demo sequence preserves every action but accelerates it to two-minute intervals', () => {
  const steps = scheduleSequence('2026-07-17T18:00:00.000Z', 'demo')
  assert.equal(steps.length, 6)
  assert.deepEqual(steps.map((step) => step.offsetMinutes), [0, 2, 4, 6, 8, 10])
  assert.equal(steps[5].dueAt, '2026-07-17T18:10:00.000Z')
})

test('Tier 1, non-US, suppressed, customer, and active-opportunity contacts cannot enroll', () => {
  const base = { countryCode: 'US', score: 80, fleetSize: 15, email: 'owner@example.com', status: 'approved' }
  assert.equal(sequenceEligibility({ ...base, score: 100 }).reason, 'tier_1_call_first')
  assert.equal(sequenceEligibility({ ...base, countryCode: 'GB' }).reason, 'us_phase_1_only')
  assert.equal(sequenceEligibility({ ...base, suppressed: true }).reason, 'suppressed')
  assert.equal(sequenceEligibility({ ...base, customer: true }).reason, 'existing_customer')
  assert.equal(sequenceEligibility({ ...base, activeOpportunity: true }).reason, 'active_opportunity')
  assert.equal(sequenceEligibility(base).eligible, true)
})

test('action keys are deterministic and every meaningful response exits the sequence', () => {
  assert.equal(actionIdempotencyKey('enrollment-1', 'email_1'), 'enrollment-1:1:email_1')
  for (const event of ['replied', 'unsubscribed', 'hard_bounced', 'complained', 'dnd', 'meeting_booked', 'opportunity_opened', 'customer', 'manual_suppression']) {
    assert.equal(shouldExitSequence(event), true, event)
  }
  assert.equal(shouldExitSequence('delivered'), false)
  assert.equal(shouldExitSequence('opened'), false)
})
