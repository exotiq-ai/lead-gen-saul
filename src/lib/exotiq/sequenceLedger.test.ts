import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSequenceDeliveryLedger, ghlContactUrl } from './sequenceLedger'

test('builds direct GHL contact links without exposing credentials', () => {
  assert.equal(
    ghlContactUrl('location-1', 'contact/1'),
    'https://app.gohighlevel.com/v2/location/location-1/contacts/detail/contact%2F1',
  )
  assert.equal(ghlContactUrl('', 'contact-1'), null)
  assert.equal(ghlContactUrl('location-1', null), null)
})

test('delivery ledger joins recipient, GHL link, and newest provider event', () => {
  const ledger = buildSequenceDeliveryLedger([
    {
      id: 'attempt-1', lead_id: 'lead-1', sequence_step: 1, mode: 'demo', provider: 'resend',
      status: 'delivered', subject: '[DEMO] Test', provider_message_id: 'message-1', error_detail: null,
      attempted_at: '2026-07-20T00:00:00Z', accepted_at: '2026-07-20T00:00:01Z', delivered_at: '2026-07-20T00:00:03Z',
      leads: { first_name: 'Gregory', last_name: 'Ringler', email: 'gregory.ringler@gmail.com', company_name: 'Exotiq Test', ghl_contact_id: 'contact-1' },
    },
  ], [
    { id: 'event-1', lead_id: 'lead-1', send_attempt_id: 'attempt-1', provider: 'resend', event_type: 'delivered', status: 'processed', quarantine_reason: null, received_at: '2026-07-20T00:00:04Z', processed_at: '2026-07-20T00:00:05Z' },
    { id: 'event-2', lead_id: 'lead-1', send_attempt_id: 'attempt-1', provider: 'resend', event_type: 'sent', status: 'processed', quarantine_reason: null, received_at: '2026-07-20T00:00:02Z', processed_at: '2026-07-20T00:00:03Z' },
  ], 'location-1')

  assert.equal(ledger[0].recipient, 'gregory.ringler@gmail.com')
  assert.equal(ledger[0].contact_name, 'Gregory Ringler')
  assert.equal(ledger[0].latest_event?.event_type, 'delivered')
  assert.match(String(ledger[0].ghl_contact_url), /contact-1$/)
})
