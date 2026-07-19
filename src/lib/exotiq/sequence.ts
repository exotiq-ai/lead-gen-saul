export type ExotiqSequenceMode = 'demo' | 'live'
export type ExotiqSequenceActionKind = 'email' | 'call_task' | 'instagram_task'

export type ExotiqSequenceStep = {
  key: 'email_1' | 'call_1' | 'instagram_1' | 'email_2' | 'email_3' | 'email_close'
  ordinal: number
  kind: ExotiqSequenceActionKind
  offsetMinutes: number
  label: string
}

export const EXOTIQ_SEQUENCE_KEY = 'exotiq-tier2-founder-outreach'
export const EXOTIQ_SEQUENCE_VERSION = 1
export const EXOTIQ_CUSTOMER_BATCH_LIMIT = 25

const LIVE_STEPS: ExotiqSequenceStep[] = [
  { key: 'email_1', ordinal: 1, kind: 'email', offsetMinutes: 0, label: 'Personalized first-touch email' },
  { key: 'call_1', ordinal: 2, kind: 'call_task', offsetMinutes: 2 * 24 * 60, label: 'Gregory call task' },
  { key: 'instagram_1', ordinal: 3, kind: 'instagram_task', offsetMinutes: 3 * 24 * 60, label: 'Manual Instagram review and DM task' },
  { key: 'email_2', ordinal: 4, kind: 'email', offsetMinutes: 5 * 24 * 60, label: 'Different-angle follow-up email' },
  { key: 'email_3', ordinal: 5, kind: 'email', offsetMinutes: 10 * 24 * 60, label: 'Short final value email' },
  { key: 'email_close', ordinal: 6, kind: 'email', offsetMinutes: 14 * 24 * 60, label: 'Respectful close-the-loop email' },
]

const DEMO_STEPS: ExotiqSequenceStep[] = LIVE_STEPS.map((step, index) => ({
  ...step,
  offsetMinutes: index * 2,
  label: `[DEMO] ${step.label}`,
}))

export function sequenceSteps(mode: ExotiqSequenceMode): ExotiqSequenceStep[] {
  return (mode === 'demo' ? DEMO_STEPS : LIVE_STEPS).map((step) => ({ ...step }))
}

export function scheduleSequence(startedAt: string, mode: ExotiqSequenceMode) {
  const start = new Date(startedAt)
  if (!Number.isFinite(start.getTime())) throw new Error('invalid sequence start time')
  return sequenceSteps(mode).map((step) => ({
    ...step,
    dueAt: new Date(start.getTime() + step.offsetMinutes * 60_000).toISOString(),
  }))
}

export type SequenceEligibilityInput = {
  countryCode?: string | null
  route?: string | null
  score?: number | null
  fleetSize?: number | null
  email?: string | null
  status?: string | null
  suppressed?: boolean
  activeOpportunity?: boolean
  customer?: boolean
}

export function sequenceEligibility(input: SequenceEligibilityInput) {
  const email = input.email?.trim().toLowerCase() || ''
  if (!email || !email.includes('@')) return { eligible: false, reason: 'missing_or_invalid_email' }
  const country = (input.countryCode || 'US').trim().toUpperCase()
  if (!['US', 'USA', 'UNITED STATES'].includes(country)) return { eligible: false, reason: 'us_phase_1_only' }
  if ((input.score || 0) >= 100 || (input.fleetSize || 0) >= 25 || input.route === 'call_only_gregory') {
    return { eligible: false, reason: 'tier_1_call_first' }
  }
  if (!['approved', 'pending'].includes(input.status || '')) return { eligible: false, reason: 'copy_not_approved' }
  if (input.suppressed) return { eligible: false, reason: 'suppressed' }
  if (input.activeOpportunity) return { eligible: false, reason: 'active_opportunity' }
  if (input.customer) return { eligible: false, reason: 'existing_customer' }
  return { eligible: true, reason: 'tier_2_email_first' }
}

export function actionIdempotencyKey(enrollmentId: string, stepKey: string) {
  return `${enrollmentId}:${EXOTIQ_SEQUENCE_VERSION}:${stepKey}`
}

export const SEQUENCE_EXIT_EVENTS = new Set([
  'replied',
  'unsubscribed',
  'hard_bounced',
  'complained',
  'dnd',
  'meeting_booked',
  'opportunity_opened',
  'customer',
  'manual_suppression',
])

export function shouldExitSequence(eventType: string) {
  return SEQUENCE_EXIT_EVENTS.has(eventType.trim().toLowerCase())
}
