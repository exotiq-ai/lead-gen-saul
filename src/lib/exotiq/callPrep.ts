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
  openingLines: string[]
  gatekeeperLines: string[]
  gatekeeperQuestions: string[]
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
  const firstProof = proofPoints[0]
  const specificProof = firstProof ? ` I saw ${firstProof.replace(/^Fleet evidence: /, '').replace(/^Market: /, 'you are in ')}.` : ''
  const fleetDescriptor = fleet ? `operators running about ${fleet} cars` : 'an exotic rental operation'
  const marketDescriptor = lead.company_location ? ` in ${lead.company_location}` : ''

  const openingLines = [
    `Hey ${openerName}, Gregory Ringler here. I run Exotiq. I know this is out of the blue. Can I take 20 seconds and you can tell me if it is irrelevant?`,
    `Reason I am calling: for ${fleetDescriptor}${marketDescriptor}, the leak is usually not demand. It is rate, availability, renter check, deposit, and handoff all moving fast enough to turn the inquiry into a paid booking.`,
    'I am a founder looking for founder/operator feedback. If the gap is real, I can load your fleet and show you the command center in 15 minutes.'
  ]

  const opener = `${openingLines.join(' ')}${specificProof} Quick question: how are you handling pricing and availability today when demand spikes around weekends or events?`

  const gatekeeperLines = [
    `Hey, this is Gregory Ringler with Exotiq. I am trying to reach the owner or operator who handles fleet revenue and bookings for ${title}.`,
    'It is not an ad call. We help exotic rental operators find money leaking between pricing, availability, deposits, renter checks, and follow-up.',
    'If they are the wrong person, who usually owns booking software or fleet operations there?'
  ]

  const gatekeeperQuestions = [
    'Are they still using a rental platform like Turo plus spreadsheets, or do they have dedicated fleet/booking software?',
    'Who handles pricing when weekends, events, or high-demand cars move faster than usual?',
    'Do most inquiries come through phone, Instagram/DMs, website, Turo, or referrals?',
    'What is the best way to get a founder-to-founder note to the person who owns that workflow?'
  ]

  const qualifyingQuestions = [
    'How many cars are you running right now, and how are you pricing them today?',
    'Where do most bookings come from today: direct, Instagram, Google, referrals, Turo, or partners?',
    'When demand spikes around weekends or events, how do you decide when and how much to move rates?',
    'How do you keep availability, deposits, agreements, renter verification, and handoffs from falling through the cracks?',
    'What would you fix first: more revenue per car, less admin time, or less renter/compliance risk?',
    'If this is worth seeing, should I load your fleet and walk you through it for 15 minutes?'
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
    `OPENING LINES: ${openingLines.join(' | ')}`,
    `GATEKEEPER: ${gatekeeperLines.join(' | ')}`,
    `GATEKEEPER QUALIFIERS: ${gatekeeperQuestions.join(' | ')}`,
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
    openingLines,
    gatekeeperLines,
    gatekeeperQuestions,
    qualifyingQuestions,
    proofPoints,
    doNotSay,
    nextBestAction,
    voicemail,
    ghlCallScript,
  }
}
