import { verify } from 'node:crypto'

export type CanonicalGhlEventType =
  | 'delivered'
  | 'soft_bounce'
  | 'hard_bounce'
  | 'complaint'
  | 'unsubscribe'
  | 'reply'
  | 'open'
  | 'call'
  | 'appointment'
  | 'opportunity'
  | 'unknown'

export function classifyGhlEvent(type: string): CanonicalGhlEventType {
  const value = type.trim().toLowerCase().replace(/[\s_-]+/g, '')
  if (value.includes('unsubscribe') || value.includes('dnd')) return 'unsubscribe'
  if (value.includes('complaint') || value.includes('spam')) return 'complaint'
  if (value.includes('hardbounce') || (value.includes('bounce') && !value.includes('soft'))) return 'hard_bounce'
  if (value.includes('softbounce')) return 'soft_bounce'
  if (value.includes('delivered')) return 'delivered'
  if (value.includes('reply') || value.includes('inboundmessage') || value.includes('smsinbound')) return 'reply'
  if (value.includes('open')) return 'open'
  if (value.includes('call')) return 'call'
  if (value.includes('appointment') || value.includes('booking')) return 'appointment'
  if (value.includes('opportunity')) return 'opportunity'
  return 'unknown'
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function extractGhlEventIdentity(payload: Record<string, unknown>) {
  const contact = (payload.contact as Record<string, unknown> | undefined) || {}
  const location = (payload.location as Record<string, unknown> | undefined) || {}
  const eventId =
    stringValue(payload.eventId) ||
    stringValue(payload.id) ||
    stringValue(payload.messageId) ||
    stringValue(payload.webhookId)
  const locationId = stringValue(payload.locationId) || stringValue(location.id)
  const contactId = stringValue(payload.contactId) || stringValue(contact.id)
  const emailRaw = stringValue(payload.email) || stringValue(contact.email)

  return {
    eventId,
    locationId,
    contactId,
    email: emailRaw ? emailRaw.toLowerCase() : null,
  }
}

export function shouldSuppressForEvent(type: CanonicalGhlEventType): boolean {
  return type === 'hard_bounce' || type === 'complaint' || type === 'unsubscribe'
}

export function verifyGhlWebhookSignature(body: string, signature: string | null, publicKeyPem: string) {
  if (!signature || signature === 'N/A') return { ok: false, reason: 'missing_signature' }
  if (!publicKeyPem.trim()) return { ok: false, reason: 'missing_public_key' }

  try {
    const ok = verify(null, Buffer.from(body, 'utf8'), publicKeyPem, Buffer.from(signature, 'base64'))
    return ok ? { ok: true as const } : { ok: false as const, reason: 'bad_signature' }
  } catch (error) {
    return { ok: false as const, reason: error instanceof Error ? error.message : 'signature_error' }
  }
}
