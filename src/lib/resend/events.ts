export type CanonicalResendEvent =
  | 'sent'
  | 'delivered'
  | 'delivery_delayed'
  | 'hard_bounce'
  | 'complaint'
  | 'failed'
  | 'open'
  | 'click'
  | 'unknown'

export function classifyResendEvent(type: string): CanonicalResendEvent {
  switch (type.trim().toLowerCase()) {
    case 'email.sent': return 'sent'
    case 'email.delivered': return 'delivered'
    case 'email.delivery_delayed': return 'delivery_delayed'
    case 'email.bounced': return 'hard_bounce'
    case 'email.complained': return 'complaint'
    case 'email.failed': return 'failed'
    case 'email.opened': return 'open'
    case 'email.clicked': return 'click'
    default: return 'unknown'
  }
}

export function resendEventSuppresses(type: CanonicalResendEvent) {
  return type === 'hard_bounce' || type === 'complaint'
}

export function resendAttemptStatus(type: CanonicalResendEvent) {
  switch (type) {
    case 'sent': return 'provider_accepted'
    case 'delivered': return 'delivered'
    case 'delivery_delayed': return 'ambiguous'
    case 'hard_bounce': return 'hard_bounced'
    case 'complaint': return 'complained'
    case 'failed': return 'failed'
    default: return null
  }
}
