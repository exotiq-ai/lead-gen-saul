import assert from 'node:assert/strict'
import test from 'node:test'
import {
  authorizeOutreachMutation,
  buildSendStateTransition,
  type MutationGateConfig,
} from './safety'

const enabled: MutationGateConfig = {
  enabled: true,
  token: 'correct-horse-battery-staple',
}

test('mutation gate fails closed when production token is missing', () => {
  assert.deepEqual(authorizeOutreachMutation(null, { enabled: true, token: '' }), {
    ok: false,
    status: 503,
    reason: 'outreach_mutations_not_configured',
  })
})

test('mutation gate rejects mutations while disabled', () => {
  assert.deepEqual(authorizeOutreachMutation('correct-horse-battery-staple', { ...enabled, enabled: false }), {
    ok: false,
    status: 503,
    reason: 'outreach_mutations_disabled',
  })
})

test('mutation gate rejects a missing or incorrect token', () => {
  const missing = authorizeOutreachMutation(null, enabled)
  const wrong = authorizeOutreachMutation('wrong', enabled)
  assert.equal(missing.ok, false)
  assert.equal(wrong.ok, false)
  if (!missing.ok) assert.equal(missing.status, 401)
  if (!wrong.ok) assert.equal(wrong.status, 401)
})

test('mutation gate authorizes a matching token without trusting caller identity', () => {
  assert.deepEqual(authorizeOutreachMutation('correct-horse-battery-staple', enabled), {
    ok: true,
    actor: 'gregory',
  })
})

test('dry run never changes an approved queue item to sent', () => {
  assert.deepEqual(
    buildSendStateTransition({
      mode: 'dry_run',
      provider: 'ghl',
      messageId: 'dryrun_1',
      channel: 'email',
      now: '2026-07-15T12:00:00.000Z',
    }),
    {
      queuePatch: {},
      activityType: 'email_send_dry_run',
      canonicalSent: false,
    },
  )
})

test('only a live provider-accepted send becomes canonical sent history', () => {
  assert.deepEqual(
    buildSendStateTransition({
      mode: 'live',
      provider: 'ghl',
      messageId: 'msg_1',
      channel: 'email',
      now: '2026-07-15T12:00:00.000Z',
    }),
    {
      queuePatch: {
        status: 'sent',
        sent_at: '2026-07-15T12:00:00.000Z',
      },
      activityType: 'email_sent',
      canonicalSent: true,
    },
  )
})
