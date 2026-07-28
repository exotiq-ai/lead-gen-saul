import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyResendEvent, readableResendEventNote, resendAttemptStatus, resendEventSuppresses } from './events'

test('classifies Resend lifecycle events deterministically', () => {
  assert.equal(classifyResendEvent('email.sent'), 'sent')
  assert.equal(classifyResendEvent('email.delivered'), 'delivered')
  assert.equal(classifyResendEvent('email.delivery_delayed'), 'delivery_delayed')
  assert.equal(classifyResendEvent('email.bounced'), 'hard_bounce')
  assert.equal(classifyResendEvent('email.complained'), 'complaint')
  assert.equal(classifyResendEvent('email.failed'), 'failed')
  assert.equal(classifyResendEvent('email.opened'), 'open')
})

test('only bounce and complaint events create global email suppression', () => {
  assert.equal(resendEventSuppresses('hard_bounce'), true)
  assert.equal(resendEventSuppresses('complaint'), true)
  assert.equal(resendEventSuppresses('failed'), false)
})

test('maps provider lifecycle to send-attempt status', () => {
  assert.equal(resendAttemptStatus('delivered'), 'delivered')
  assert.equal(resendAttemptStatus('hard_bounce'), 'hard_bounced')
  assert.equal(resendAttemptStatus('complaint'), 'complained')
  assert.equal(resendAttemptStatus('failed'), 'failed')
  assert.equal(resendAttemptStatus('open'), null)
})

test('creates readable CRM notes for delivery-state changes but not noisy opens', () => {
  assert.equal(
    readableResendEventNote({ type: 'delivered', subject: 'Quick operator question', providerMessageId: 'msg-1' }),
    'Exotiq email delivery update: accepted by the recipient mail server. Subject: Quick operator question. Resend message ID: msg-1.',
  )
  assert.equal(readableResendEventNote({ type: 'open', subject: 'Ignored' }), null)
})
