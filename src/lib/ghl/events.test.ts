import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import test from 'node:test'
import {
  classifyGhlEvent,
  extractGhlEventIdentity,
  shouldSuppressForEvent,
  verifyGhlWebhookSignature,
} from './events'

test('classifies delivery lifecycle events without calling them replies', () => {
  assert.equal(classifyGhlEvent('EmailDelivered'), 'delivered')
  assert.equal(classifyGhlEvent('EmailBounced'), 'hard_bounce')
  assert.equal(classifyGhlEvent('EmailComplaint'), 'complaint')
  assert.equal(classifyGhlEvent('EmailUnsubscribed'), 'unsubscribe')
  assert.equal(classifyGhlEvent('InboundMessage'), 'reply')
  assert.equal(classifyGhlEvent('EmailOpened'), 'open')
})

test('unknown email events remain unknown rather than becoming replies', () => {
  assert.equal(classifyGhlEvent('EmailQueued'), 'unknown')
})

test('extracts provider event id, location, contact, and normalized email', () => {
  assert.deepEqual(
    extractGhlEventIdentity({
      id: 'evt_123',
      locationId: 'loc_exotiq',
      contactId: 'contact_1',
      email: ' OWNER@Example.COM ',
    }),
    {
      eventId: 'evt_123',
      locationId: 'loc_exotiq',
      contactId: 'contact_1',
      email: 'owner@example.com',
    },
  )
})

test('hard bounce, complaint, and unsubscribe create global suppression', () => {
  assert.equal(shouldSuppressForEvent('hard_bounce'), true)
  assert.equal(shouldSuppressForEvent('complaint'), true)
  assert.equal(shouldSuppressForEvent('unsubscribe'), true)
  assert.equal(shouldSuppressForEvent('reply'), false)
})

test('verifies current GHL Ed25519 webhook signatures and rejects tampering', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const body = JSON.stringify({ event: 'InboundMessage', contactId: 'abc' })
  const signature = sign(null, Buffer.from(body, 'utf8'), privateKey).toString('base64')
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()

  assert.deepEqual(verifyGhlWebhookSignature(body, signature, publicKeyPem), { ok: true })
  assert.equal(verifyGhlWebhookSignature(`${body} `, signature, publicKeyPem).ok, false)
})
