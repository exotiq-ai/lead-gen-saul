import { buildContactLinks } from '@/lib/leads/contactLinks'
import { buildCallPrep } from '@/lib/exotiq/callPrep'

export type RoadTripCitySlug = 'dallas' | 'austin' | 'houston' | 'jacksonville' | 'orlando' | 'tampa' | 'miami'

export interface RoadTripCity {
  slug: RoadTripCitySlug
  name: string
  state: 'TX' | 'FL'
  aliases: string[]
  map: { x: number; y: number }
}

export const ROAD_TRIP_CITIES: RoadTripCity[] = [
  { slug: 'dallas', name: 'Dallas', state: 'TX', aliases: ['dallas', 'dfw', 'dallas-fort worth'], map: { x: 10, y: 24 } },
  { slug: 'austin', name: 'Austin', state: 'TX', aliases: ['austin'], map: { x: 18, y: 61 } },
  { slug: 'houston', name: 'Houston', state: 'TX', aliases: ['houston'], map: { x: 30, y: 73 } },
  { slug: 'jacksonville', name: 'Jacksonville', state: 'FL', aliases: ['jacksonville'], map: { x: 67, y: 31 } },
  { slug: 'orlando', name: 'Orlando', state: 'FL', aliases: ['orlando'], map: { x: 73, y: 52 } },
  { slug: 'tampa', name: 'Tampa', state: 'FL', aliases: ['tampa', 'tampa bay'], map: { x: 66, y: 67 } },
  { slug: 'miami', name: 'Miami', state: 'FL', aliases: ['miami'], map: { x: 84, y: 88 } },
]

export interface RoadTripLeadInput {
  id: string
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  company_location?: string | null
  company_domain?: string | null
  email?: string | null
  phone?: string | null
  score?: number | null
  score_breakdown?: Record<string, unknown> | null
  status?: string | null
  assigned_to?: string | null
  last_activity_at?: string | null
  red_flags?: Array<{ code?: string; reason?: string }> | null
}

export interface RoadTripAction {
  label: string
  href: string
  value?: string
}

export interface RoadTripLead {
  id: string
  city: RoadTripCitySlug | null
  companyName: string
  contactName: string | null
  location: string | null
  locationPrecision: 'address' | 'city' | 'missing'
  score: number
  status: string
  assignedTo: string | null
  lastActivityAt: string | null
  priority: number
  highPriority: boolean
  needsResearch: boolean
  proofPoint: string
  fleetSize: string | null
  phoneConfidence: string | null
  callOpener: string
  nextAction: { label: string; reason: string; href: string | null }
  actions: {
    phone: RoadTripAction | null
    sms: RoadTripAction | null
    email: RoadTripAction | null
    instagram: RoadTripAction | null
    website: RoadTripAction | null
    googleMaps: RoadTripAction
    lead: RoadTripAction
    outreach: RoadTripAction
  }
}

export interface RoadTripFilters {
  query: string
  priorityOnly: boolean
  callableOnly: boolean
  instagramOnly: boolean
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function formatFleetSize(raw: unknown): string | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return `${Math.round(raw)} vehicles`
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return null
}

function looksLikeStreetAddress(location: string): boolean {
  return /^\s*\d+[A-Za-z-]*\s+.+\b(?:st(?:reet)?|ave(?:nue)?|rd|road|blvd|boulevard|dr(?:ive)?|ln|lane|way|ct|court|pkwy|parkway|hwy|highway)\b/i.test(location)
}

export function cityFromLocation(location?: string | null): RoadTripCitySlug | null {
  if (!location) return null
  const normalized = location.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ')
  const city = ROAD_TRIP_CITIES.find((candidate) => candidate.aliases.some((alias) => normalized.includes(alias)))
  return city?.slug ?? null
}

function mapsQuery(input: RoadTripLeadInput): string {
  return [input.company_name, input.company_location].filter(Boolean).join(' ')
}

function priorityFor(input: RoadTripLeadInput, hasPhone: boolean, hasInstagram: boolean, hasWebsite: boolean): number {
  const score = Math.max(0, Number(input.score) || 0)
  const status = input.status?.toLowerCase() ?? ''
  const followUp = status === 'engaged' || status === 'qualified'
  const redFlagPenalty = (input.red_flags ?? []).some((flag) => ['bad_data', 'wrong_icp', 'duplicate', 'competitor'].includes(flag.code ?? '')) ? 20 : 0

  return score
    + (followUp ? 25 : 0)
    + (input.assigned_to === 'gregory' ? 15 : 0)
    + (hasPhone ? 12 : 0)
    + (hasInstagram ? 8 : 0)
    + (hasWebsite ? 5 : 0)
    - redFlagPenalty
}

export function buildRoadTripLead(input: RoadTripLeadInput): RoadTripLead {
  const scoreBreakdown = input.score_breakdown ?? {}
  const callPrep = buildCallPrep({
    company_name: input.company_name,
    first_name: input.first_name,
    last_name: input.last_name,
    phone: input.phone,
    email: input.email,
    company_domain: input.company_domain,
    company_location: input.company_location,
    score: input.score,
    score_breakdown: scoreBreakdown,
  })
  const contactLinks = buildContactLinks({
    email: input.email,
    phone: input.phone,
    company_domain: input.company_domain ?? firstString(scoreBreakdown.website),
    score_breakdown: scoreBreakdown,
  })
  const query = mapsQuery(input)
  const encodedQuery = encodeURIComponent(query)
  const city = cityFromLocation(input.company_location)
  const locationPrecision = !input.company_location
    ? 'missing'
    : looksLikeStreetAddress(input.company_location)
      ? 'address'
      : 'city'
  const hasPhone = Boolean(contactLinks.phone)
  const hasInstagram = Boolean(contactLinks.instagram)
  const hasWebsite = Boolean(contactLinks.website)
  const priority = priorityFor(input, hasPhone, hasInstagram, hasWebsite)
  const score = Math.max(0, Number(input.score) || 0)
  const status = input.status?.toLowerCase() ?? 'new'
  const followUp = status === 'engaged' || status === 'qualified'
  const companyName = input.company_name?.trim() || 'Unnamed operator'
  const contactName = [input.first_name, input.last_name].filter(Boolean).join(' ').trim() || null
  const phoneDigits = input.phone?.replace(/\D/g, '') ?? ''
  const smsHref = phoneDigits.length === 10
    ? `sms:+1${phoneDigits}`
    : phoneDigits.length === 11 && phoneDigits.startsWith('1')
      ? `sms:+${phoneDigits}`
      : null
  const proofPoint = firstString(
    scoreBreakdown.scoring_rationale,
    scoreBreakdown.recent_activity_summary,
    scoreBreakdown.fleet_evidence_summary,
  ) ?? (input.company_location ? `Operator listed in ${input.company_location}.` : 'Review the full lead before contact.')
  const fleetSize = formatFleetSize(scoreBreakdown.fleet_size ?? scoreBreakdown.fleet_raw ?? scoreBreakdown.claimed_fleet_count)
  const phoneConfidence = firstString(scoreBreakdown.phone_confidence, scoreBreakdown.contact_phone_source)
  const primaryHref = followUp ? contactLinks.phone?.href ?? null : contactLinks.phone?.href ?? contactLinks.instagram?.href ?? contactLinks.website?.href ?? null
  const nextAction = followUp
    ? { label: 'Follow up now', reason: 'This operator is already engaged and ready for a follow-up.', href: primaryHref }
    : contactLinks.phone
      ? { label: 'Call operator', reason: input.assigned_to === 'gregory' ? 'Assigned to Gregory with a callable number.' : 'Verified callable data is available.', href: contactLinks.phone.href }
      : contactLinks.instagram
        ? { label: 'Open Instagram', reason: 'No callable number; use the available Instagram profile.', href: contactLinks.instagram.href }
        : contactLinks.website
          ? { label: 'Research website', reason: 'Contact details need research before outreach.', href: contactLinks.website.href }
          : { label: 'Review lead', reason: 'Contact and location data need review.', href: `/dashboard/leads/${input.id}` }

  return {
    id: input.id,
    city,
    companyName,
    contactName,
    location: input.company_location?.trim() || null,
    locationPrecision,
    score,
    status,
    assignedTo: input.assigned_to ?? null,
    lastActivityAt: input.last_activity_at ?? null,
    priority,
    highPriority: score >= 70 || input.assigned_to === 'gregory' || followUp,
    needsResearch: !hasPhone || !hasWebsite,
    proofPoint,
    fleetSize,
    phoneConfidence,
    callOpener: callPrep.opener,
    nextAction,
    actions: {
      phone: contactLinks.phone,
      sms: smsHref && input.phone ? { label: 'Text', href: smsHref, value: input.phone } : null,
      email: contactLinks.email,
      instagram: contactLinks.instagram,
      website: contactLinks.website,
      googleMaps: { label: 'Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${encodedQuery}` },
      lead: { label: 'Lead details', href: `/dashboard/leads/${input.id}` },
      outreach: { label: 'Outreach', href: `/dashboard/outreach?lead_id=${input.id}` },
    },
  }
}

export function filterRoadTripLeads(leads: RoadTripLead[], filters: RoadTripFilters): RoadTripLead[] {
  const query = filters.query.trim().toLowerCase()
  return leads.filter((lead) => {
    if (filters.priorityOnly && !lead.highPriority) return false
    if (filters.callableOnly && !lead.actions.phone) return false
    if (filters.instagramOnly && !lead.actions.instagram) return false
    if (query && ![lead.companyName, lead.contactName, lead.location].filter(Boolean).some((value) => value!.toLowerCase().includes(query))) return false
    return true
  })
}

export function summarizeRoadTripCity(leads: RoadTripLead[]) {
  return {
    total: leads.length,
    priority: leads.filter((lead) => lead.highPriority).length,
    callable: leads.filter((lead) => lead.actions.phone).length,
    instagram: leads.filter((lead) => lead.actions.instagram).length,
    needsResearch: leads.filter((lead) => lead.needsResearch).length,
    followUps: leads.filter((lead) => lead.status === 'engaged' || lead.status === 'qualified').length,
  }
}
