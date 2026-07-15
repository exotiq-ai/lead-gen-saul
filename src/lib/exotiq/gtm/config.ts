export type ExotiqGtmConfig = {
  phase1Countries: string[]
  phase2Countries: string[]
  phase2Enabled: boolean
  cta: '15-minute founder call'
  sender: {
    fromName: string
    sendingAddress: string
    replyTo: string
    physicalAddress: string
  }
}

export const DEFAULT_EXOTIQ_GTM_CONFIG: ExotiqGtmConfig = {
  phase1Countries: ['US'],
  phase2Countries: ['GB', 'UK'],
  phase2Enabled: false,
  cta: '15-minute founder call',
  sender: {
    fromName: 'Gregory Ringler | Exotiq',
    sendingAddress: 'gregory@outreach.exotiq.ai',
    replyTo: 'hello@exotiq.ai',
    physicalAddress: '1001 S Main St #6709, Kalispell, MT 59901',
  },
}

function normalizeCountry(countryCode?: string | null) {
  const value = (countryCode || 'US').trim().toUpperCase()
  if (value === 'UNITED STATES' || value === 'USA') return 'US'
  if (value === 'UNITED KINGDOM') return 'GB'
  return value
}

export function assertAllowedMarket(countryCode: string | null | undefined, config = DEFAULT_EXOTIQ_GTM_CONFIG) {
  const country = normalizeCountry(countryCode)
  if (config.phase1Countries.includes(country)) return true
  if (config.phase2Enabled && config.phase2Countries.includes(country)) return true
  return false
}

export function buildFounderSenderConfig(config = DEFAULT_EXOTIQ_GTM_CONFIG) {
  return config.sender
}

export type RouteInput = {
  score?: number | null
  fleetSize?: number | null
  countryCode?: string | null
  hasEmail?: boolean
  hasInstagram?: boolean
}

export function chooseOutreachRoute(input: RouteInput, config = DEFAULT_EXOTIQ_GTM_CONFIG) {
  const country = normalizeCountry(input.countryCode)
  const phase = config.phase2Countries.includes(country) ? 2 : 1
  if (phase === 2 && !config.phase2Enabled) {
    return {
      route: 'manual_review',
      cta: config.cta,
      phase,
      reason: 'UK phase 2 is planned but disabled',
    }
  }

  const score = input.score || 0
  const fleetSize = input.fleetSize || 0
  if (score >= 100 || fleetSize >= 25) {
    return {
      route: 'call_only_gregory',
      cta: config.cta,
      phase,
      reason: 'Tier 1 or 25-plus fleet routes Gregory call first',
    }
  }
  if (input.hasEmail && input.hasInstagram) {
    return {
      route: 'email_plus_ig',
      cta: config.cta,
      phase,
      reason: 'US phase 1 operator with email and IG support channel',
    }
  }
  if (input.hasEmail) {
    return {
      route: 'email_first',
      cta: config.cta,
      phase,
      reason: 'US phase 1 operator with email only',
    }
  }
  return {
    route: 'manual_review',
    cta: config.cta,
    phase,
    reason: 'Needs channel enrichment before outreach',
  }
}
