export type CallPrepLead = {
  company_name?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  email?: string | null
  company_domain?: string | null
  company_location?: string | null
  score?: number | null
  score_breakdown?: Record<string, unknown> | null
}

export type CallPrep = {
  callablePhone: string | null
  phoneHref: string | null
  phoneConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'MISSING'
  phoneSource: string
  opener: string
  qualifyingQuestions: string[]
  proofPoints: string[]
  doNotSay: string[]
  nextBestAction: string
  voicemail: string
  ghlCallScript: string
}

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function normalizePhone(raw: unknown): string | null {
  const value = asString(raw)
  if (!value) return null
  if (value.includes('@')) return null
  const match = value.match(PHONE_RE)?.[0] ?? null
  if (!match && value.replace(/\D/g, '').length < 10) return null
  const digits = (match ?? value).replace(/\D/g, '')
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return null
}

function extractPhoneFromText(raw: unknown): string | null {
  const value = asString(raw)
  if (!value) return null
  const match = value.match(PHONE_RE)?.[0]
  return normalizePhone(match)
}

function firstString(sb: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(sb[key])
    if (value) return value
  }
  return null
}

function getFleetSize(sb: Record<string, unknown>): number | null {
  return asNumber(sb.fleet_size) ?? asNumber(sb.fleet_raw)
}

function getOwnerName(lead: CallPrepLead, sb: Record<string, unknown>): string | null {
  const direct = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim()
  return direct || firstString(sb, ['owner_name', 'owner', 'contact_name', 'decision_maker'])
}

function makeProofPoints(lead: CallPrepLead, sb: Record<string, unknown>): string[] {
  const proof: string[] = []
  const fleet = getFleetSize(sb)
  const ig = firstString(sb, ['company_ig_handle', 'instagram_handle', 'ig_handle', 'instagram_url'])
  const followers = asNumber(sb.company_ig_followers)
  const reviews = asNumber(sb.company_google_reviews)
  const rating = asNumber(sb.company_google_rating)
  const rationale = asString(sb.scoring_rationale)

  if (fleet && fleet > 0) proof.push(`Fleet evidence: about ${fleet} vehicles`)
  if (ig) proof.push(`Instagram: ${ig}${followers ? `, ${followers.toLocaleString()} followers` : ''}`)
  if (reviews || rating) proof.push(`Google: ${rating ? `${rating.toFixed(1)} rating` : ''}${reviews ? `${rating ? ', ' : ''}${reviews.toLocaleString()} reviews` : ''}`)
  if (lead.company_location) proof.push(`Market: ${lead.company_location}`)
  if (rationale) proof.push(rationale.length > 180 ? `${rationale.slice(0, 177)}...` : rationale)

  return Array.from(new Set(proof)).slice(0, 5)
}

export function buildCallPrep(lead: CallPrepLead): CallPrep {
  const sb = lead.score_breakdown ?? {}
  const title = lead.company_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'the fleet'
  const owner = getOwnerName(lead, sb)
  const fleet = getFleetSize(sb)
  const score = lead.score ?? 0
  const directPhone = normalizePhone(lead.phone)
  const rationalePhone = extractPhoneFromText(sb.scoring_rationale)
  const callablePhone = directPhone ?? rationalePhone
  const phoneConfidence = directPhone ? 'HIGH' : rationalePhone ? 'MEDIUM' : lead.phone ? 'LOW' : 'MISSING'
  const phoneSource = directPhone ? 'Lead phone field' : rationalePhone ? 'Recovered from scoring rationale' : lead.phone ? 'Phone field looked invalid, verify before calling' : 'No phone yet'
  const proofPoints = makeProofPoints(lead, sb)
  const openerName = owner ? owner.split(/\s+/)[0] : title
  const specificProof = proofPoints[0] ? ` I saw ${proofPoints[0].replace(/^Fleet evidence: /, '').replace(/^Market: /, 'you are in ')}.` : ''

  const opener = `Hey ${openerName}, this is Gregory Ringler. I run Exotiq, we build fleet management tools for exotic rental operators. I will be quick.${specificProof} I am calling to compare notes on how you are handling direct bookings, fleet availability, pricing, deposits, and insurance workflows. Is it worth five minutes?`

  const qualifyingQuestions = [
    'Where do most bookings come from today, direct, Instagram, Google, referrals, Turo, or partners?',
    'How do you track availability, deposits, agreements, driver verification, and handoffs across the fleet?',
    'How often do you adjust pricing around weekends, events, and high-demand cars?',
    'Which bottleneck would you fix first if it saved time or increased direct bookings this month?',
    'If the fit is real, would it be worth grabbing 15 minutes to look at the operator command center?'
  ]

  const doNotSay = [
    'Do not lead with pricing or discounts.',
    'Do not say book a demo.',
    'Do not overpromise marketplace or insurance as live today.',
    'Do not pitch generic AI tools, anchor on direct-booking and fleet workflow pain.'
  ]

  const nextBestAction = score >= 100 || (fleet ?? 0) >= 25
    ? 'Gregory-only priority call. Phone first, then manual IG/email if no answer.'
    : callablePhone
      ? 'Call first, log outcome in GHL, then send approved follow-up copy.'
      : 'Find/verify phone, then use IG, email, or website form as alternate channel.'

  const voicemail = `Hey ${owner ? owner.split(/\s+/)[0] : title}, Gregory Ringler with Exotiq. We build tools for exotic rental operators to tighten up direct bookings, fleet availability, pricing, and follow-up. I had a quick operator-specific question for ${title}. You can call or text me back, or I can send the context over.`

  const ghlCallScript = [
    `CALL PRIORITY: ${nextBestAction}`,
    `PHONE: ${callablePhone ?? 'Missing, verify before call'} (${phoneConfidence}, ${phoneSource})`,
    `OPENER: ${opener}`,
    `QUESTIONS: ${qualifyingQuestions.join(' | ')}`,
    `PROOF POINTS: ${proofPoints.length ? proofPoints.join(' | ') : 'No verified proof points, keep call discovery-led.'}`,
    `VOICEMAIL: ${voicemail}`,
    `DO NOT SAY: ${doNotSay.join(' ')}`
  ].join('\n')

  return {
    callablePhone,
    phoneHref: callablePhone ? `tel:${callablePhone}` : null,
    phoneConfidence,
    phoneSource,
    opener,
    qualifyingQuestions,
    proofPoints,
    doNotSay,
    nextBestAction,
    voicemail,
    ghlCallScript,
  }
}
