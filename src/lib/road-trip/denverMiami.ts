import type { RoadTripLeadInput } from './model'

export const TRIP_ID = 'denver-miami-2026'
export const TRIP_MARKETS = [
  { slug: 'denver', name: 'Denver', state: 'CO', kind: 'origin', note: 'Departure. No Denver prospecting sweep in this trip.' },
  { slug: 'kansas-city', name: 'Kansas City', state: 'MO', kind: 'corridor', note: 'On the eastbound corridor. Confirm meetings before adding visit time.' },
  { slug: 'st-louis', name: 'St. Louis', state: 'MO', kind: 'requested', note: 'Requested market. Quality beats filling a stop list.' },
  { slug: 'nashville', name: 'Nashville', state: 'TN', kind: 'requested', note: 'Requested market. Group confirmed meetings by location.' },
  { slug: 'atlanta', name: 'Atlanta', state: 'GA', kind: 'requested', note: 'Requested market. Avoid cross-city backtracking.' },
  { slug: 'jacksonville', name: 'Jacksonville', state: 'FL', kind: 'friend-stop', note: 'Fixed stop to visit a friend. Sales visits fit around personal plans.' },
  { slug: 'orlando', name: 'Orlando', state: 'FL', kind: 'optional', note: 'Optional detour. Add only after qualified meetings are confirmed.' },
  { slug: 'palm-beach', name: 'Palm Beach', state: 'FL', kind: 'corridor', note: 'Southbound corridor. Confirm each branch and decision-maker.' },
  { slug: 'fort-lauderdale', name: 'Fort Lauderdale', state: 'FL', kind: 'corridor', note: 'Southbound corridor. Include nearby Broward locations.' },
  { slug: 'miami', name: 'Miami', state: 'FL', kind: 'destination', note: 'Destination. Separate existing relationships from new prospects.' },
] as const
export type TripMarket = typeof TRIP_MARKETS[number]['slug']

export interface TripResearch {
  trip_id: string
  company_name: string
  city: string
  state: string
  market_slug?: TripMarket
  website?: string | null
  phone?: string | null
  email?: string | null
  checked_at: string
  priority: 'A' | 'B' | 'hold'
  notes?: string | string[]
  source_urls: string[]
  owner: { name?: string | null; role?: string | null; confidence?: string; source_url?: string | null; note?: string }
  icp: { self_drive?: boolean | null; fleet_min_visible?: number | null; fleet_confidence?: string; evidence_url?: string | null; note?: string }
  address: { official?: string | null; google?: string | null; status: string; note?: string; source_urls?: string[] }
  google?: {
    place_id?: string | null; maps_url?: string | null; rating?: number | null; review_count?: number | null
    business_status?: string | null; retrieved_at?: string; reviews_basis?: string
    reviews?: Array<{ date?: string | null; stars?: number | null; text_summary?: string; url?: string | null; author_name?: string | null; author_url?: string | null; excerpt?: boolean }>
  }
  instagram?: { handle?: string | null; url?: string | null; coverage?: string; posts?: Array<{ date?: string | null; url?: string | null; summary?: string }> }
  contact_conflicts?: Record<string, { existing: string; researched: string; resolution: string }>
}

export function safeWebUrl(value?: string | null): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return null
    return parsed.href
  } catch { return null }
}

export function googleLeg(origin: string, destination: string): string {
  const params = new URLSearchParams({ api: '1', origin, destination, travelmode: 'driving' })
  return `https://www.google.com/maps/dir/?${params}`
}

function marketFor(r: TripResearch): TripMarket | null {
  if (TRIP_MARKETS.some(m => m.slug === r.market_slug)) return r.market_slug!
  const text = `${r.city} ${r.state}`.toLowerCase()
  const aliases: Array<[TripMarket, RegExp]> = [
    ['kansas-city', /kansas city|overland park|olathe|lenexa|shawnee/], ['st-louis', /st\.? louis|saint louis|chesterfield|st\.? charles/],
    ['nashville', /nashville|franklin|brentwood|murfreesboro/], ['atlanta', /atlanta|marietta|sandy springs|alpharetta|duluth|roswell|buckhead/],
    ['jacksonville', /jacksonville|ponte vedra|orange park/], ['orlando', /orlando|kissimmee|winter park/],
    ['palm-beach', /palm beach|boca raton|delray|jupiter/], ['fort-lauderdale', /lauderdale|hollywood|pompano|dania|broward/],
    ['miami', /miami|doral|hialeah|aventura/], ['denver', /denver/],
  ]
  return aliases.find(([, pattern]) => pattern.test(text))?.[0] ?? null
}

export function tripLead(input: RoadTripLeadInput, now = new Date()) {
  const value = input.score_breakdown?.road_trip_2026
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const r = value as TripResearch
  if (r.trip_id !== TRIP_ID || !r.address || !r.icp || !r.owner || !Array.isArray(r.source_urls)) return null
  const codes = (input.red_flags ?? []).map(f => typeof f === 'string' ? f : f.code)
  if (['converted','lost','disqualified'].includes(input.status?.toLowerCase() ?? '')
    || codes.some(c => c && ['wrong_icp','competitor','duplicate','unsubscribed','negative_reply','do_not_contact'].includes(c))) return null
  const market = marketFor(r)
  if (!market) return null
  const checkedTime = Date.parse(r.checked_at)
  const age = (now.getTime() - checkedTime) / 86_400_000
  const fresh = Number.isFinite(age) && age >= -1 && age <= 14
  const qualified = r.icp.self_drive === true && Number(r.icp.fleet_min_visible) >= 5 && r.priority !== 'hold'
  const closed = Boolean(r.google?.business_status?.startsWith('CLOSED'))
  const address = r.address.official || r.address.google || null
  const matched = ['verified_business_location', 'appointment_only'].includes(r.address.status)
  const visitState = qualified && !closed && fresh && matched && address
    ? r.address.status === 'appointment_only' ? 'appointment' as const : 'call-first' as const
    : 'research' as const
  const directions = visitState !== 'research' && address
    ? `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination: address, travelmode: 'driving', ...(r.google?.place_id ? { destination_place_id: r.google.place_id } : {}) })}`
    : null
  const ownerVerified = ['high','confirmed'].includes(r.owner.confidence?.toLowerCase() ?? '')
  const ownerLabel = r.owner.name ? `${r.owner.name}${ownerVerified ? '' : ' (unverified)'}` : 'Owner unverified'
  const number = r.phone?.replace(/\D/g, '') ?? ''
  const phone = number.length === 10 ? `+1${number}` : number.length === 11 && number.startsWith('1') ? `+${number}` : null
  const email = typeof r.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email) ? r.email : null
  const website = safeWebUrl(r.website)
  const instagram = safeWebUrl(r.instagram?.url)
  const mapsListing = safeWebUrl(r.google?.maps_url)
  const followUp = ['engaged','qualified'].includes(input.status ?? '')
  const reasons = [!qualified ? 'Fleet / fit needs confirmation' : null, !fresh ? 'Research needs refresh' : null,
    closed ? 'Google reports closed' : null, !matched ? 'Visit address not cleared' : null,
    !r.owner.name ? 'Owner name missing' : null, !email ? 'Public email missing' : null,
    !(r.instagram?.posts?.length) ? 'No dated Instagram post verified' : null,
    r.contact_conflicts && Object.keys(r.contact_conflicts).length ? 'Contact conflict, compare sources' : null].filter(Boolean) as string[]
  return {
    id: input.id, market, research: r, companyName: r.company_name, status: input.status ?? 'new',
    followUp, fresh, qualified, closed, visitState, address, directions, ownerLabel,
    phone, email, website, instagram, mapsListing, reasons,
    priority: (followUp ? 100 : 0) + (r.priority === 'A' ? 30 : r.priority === 'B' ? 15 : 0) + (visitState !== 'research' ? 10 : 0),
  }
}

export type TripLead = NonNullable<ReturnType<typeof tripLead>>
