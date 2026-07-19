import assert from 'node:assert/strict'
import test from 'node:test'
import { emailAttemptReachedProvider, summarizeSequenceTracking } from './sequenceTracking'

test('accepted and delivered email attempts both count as successful provider handoff', () => {
  assert.equal(emailAttemptReachedProvider('provider_accepted'), true)
  assert.equal(emailAttemptReachedProvider('delivered'), true)
  assert.equal(emailAttemptReachedProvider('attempting'), false)
  assert.equal(emailAttemptReachedProvider('failed'), false)
})

test('sequence tracking summary exposes enrollment, action, delivery, event, suppression, and overdue counts', () => {
  const summary = summarizeSequenceTracking({
    enrollments: [
      { status: 'active', mode: 'live' },
      { status: 'completed', mode: 'demo' },
      { status: 'exited', mode: 'live' },
    ],
    actions: [
      { status: 'pending', action_kind: 'email', due_at: '2026-07-19T10:00:00.000Z' },
      { status: 'completed', action_kind: 'email', due_at: '2026-07-18T10:00:00.000Z' },
      { status: 'completed', action_kind: 'call_task', due_at: '2026-07-18T10:00:00.000Z' },
    ],
    attempts: [
      { status: 'delivered' },
      { status: 'provider_accepted' },
      { status: 'hard_bounced' },
    ],
    events: [
      { event_type: 'delivered', status: 'processed' },
      { event_type: 'reply', status: 'processed' },
      { event_type: 'unknown', status: 'quarantined' },
    ],
    suppressions: [{ active: true }, { active: false }],
    now: '2026-07-19T12:00:00.000Z',
  })

  assert.deepEqual(summary.enrollments, { total: 3, by_status: { active: 1, completed: 1, exited: 1 }, by_mode: { live: 2, demo: 1 } })
  assert.deepEqual(summary.actions.by_kind, { email: 2, call_task: 1 })
  assert.equal(summary.actions.overdue_pending, 1)
  assert.equal(summary.email_attempts.provider_handoffs, 2)
  assert.equal(summary.email_attempts.delivered, 1)
  assert.equal(summary.email_attempts.hard_bounced, 1)
  assert.equal(summary.events.replies, 1)
  assert.equal(summary.events.quarantined, 1)
  assert.equal(summary.active_suppressions, 1)
})
