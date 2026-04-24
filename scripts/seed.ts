/**
 * seed.ts — Exotiq Demo Data Generator
 * Generates 500 realistic leads for the Exotiq tenant (exotic car rental operators).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx ts-node scripts/seed.ts
 */

import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS & FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

const MARKET_TIERS: Record<string, { tier: 1 | 2 | 3; modifier: number }> = {
  'Miami':           { tier: 1, modifier: 15 },
  'Miami Beach':     { tier: 1, modifier: 15 },
  'Las Vegas':       { tier: 1, modifier: 15 },
  'Los Angeles':     { tier: 1, modifier: 15 },
  'Beverly Hills':   { tier: 1, modifier: 15 },
  'Scottsdale':      { tier: 1, modifier: 15 },
  'San Diego':       { tier: 1, modifier: 15 },
  'New York':        { tier: 2, modifier: 8 },
  'Houston':         { tier: 2, modifier: 8 },
  'Atlanta':         { tier: 2, modifier: 8 },
  'Dallas':          { tier: 2, modifier: 8 },
  'Tampa':           { tier: 2, modifier: 8 },
  'Phoenix':         { tier: 2, modifier: 8 },
  'Austin':          { tier: 2, modifier: 8 },
  'Washington DC':   { tier: 2, modifier: 8 },
  'The Hamptons':    { tier: 2, modifier: 8 },
  'Chicago':         { tier: 2, modifier: 8 },
  'Boston':          { tier: 2, modifier: 8 },
  'Denver':          { tier: 3, modifier: 3 },
  'Seattle':         { tier: 3, modifier: 3 },
  'San Francisco':   { tier: 3, modifier: 3 },
  'Nashville':       { tier: 3, modifier: 3 },
  'Orlando':         { tier: 3, modifier: 3 },
  'Charlotte':       { tier: 3, modifier: 3 },
}

const TIER1_CITIES  = Object.keys(MARKET_TIERS).filter(c => MARKET_TIERS[c].tier === 1)
const TIER2_CITIES  = Object.keys(MARKET_TIERS).filter(c => MARKET_TIERS[c].tier === 2)
const TIER3_CITIES  = Object.keys(MARKET_TIERS).filter(c => MARKET_TIERS[c].tier === 3)
const ALL_CITIES    = Object.keys(MARKET_TIERS)

const VEHICLE_QUALITIES = ['exotic', 'ultra_luxury', 'luxury', 'mixed'] as const
type VehicleQuality = typeof VEHICLE_QUALITIES[number]

const QUALITY_VEHICLE_EXAMPLES: Record<VehicleQuality, string[]> = {
  exotic:      ['Ferrari 488', 'Lamborghini Huracán', 'McLaren 720S', 'Rolls-Royce Wraith', 'Ferrari F8', 'Lambo Urus', 'Ferrari Roma'],
  ultra_luxury:['Bentley Bentayga', 'Mercedes G-Wagon', 'Porsche 911 Turbo', 'Porsche Taycan', 'Bentley Continental GT', 'Rolls-Royce Ghost'],
  luxury:      ['Mercedes AMG GT', 'Range Rover Sport', 'BMW M8', 'Cadillac Escalade', 'BMW M5', 'Mercedes S-Class'],
  mixed:       ['Lambo + G-Wagon + Escalade', 'Ferrari + Range Rover', 'McLaren + AMG + M5'],
}

// Owner name pools by market demographic mix
const FIRST_NAMES_LATIN  = ['Carlos', 'Miguel', 'Alejandro', 'Diego', 'Rafael', 'Andrés', 'Juan', 'Ernesto', 'Marco', 'Roberto', 'Luis', 'Eduardo', 'Ricardo', 'Sebastián', 'Nicolás']
const FIRST_NAMES_MENA   = ['Omar', 'Ali', 'Hassan', 'Khalid', 'Yousef', 'Tariq', 'Rami', 'Faisal', 'Nasser', 'Ziad', 'Amir', 'Sami', 'Karim', 'Bilal', 'Walid']
const FIRST_NAMES_ANGLO  = ['Jason', 'Tyler', 'Brandon', 'Kyle', 'Cody', 'Trevor', 'Blake', 'Chase', 'Ryan', 'Derek', 'Logan', 'Connor', 'Brent', 'Austin', 'Jordan']
const FIRST_NAMES_ALL    = [...FIRST_NAMES_LATIN, ...FIRST_NAMES_MENA, ...FIRST_NAMES_ANGLO]

const LAST_NAMES_LATIN   = ['Rivera', 'Morales', 'Herrera', 'Reyes', 'Torres', 'Castillo', 'Vargas', 'Flores', 'Mendoza', 'Salazar', 'Jiménez', 'Cruz', 'Delgado', 'Ramos']
const LAST_NAMES_MENA    = ['Al-Rashidi', 'Hassan', 'Khalid', 'Mansouri', 'Al-Farsi', 'Nasser', 'Karimi', 'Bakr', 'Qureshi', 'Jabr', 'Zidan', 'Rafiq', 'Aziz']
const LAST_NAMES_ANGLO   = ['Williams', 'Johnson', 'Thompson', 'Harris', 'Mitchell', 'Carter', 'Anderson', 'Walker', 'Davis', 'Bennett', 'Hughes', 'Moore', 'Evans']
const LAST_NAMES_ALL     = [...LAST_NAMES_LATIN, ...LAST_NAMES_MENA, ...LAST_NAMES_ANGLO]

const COMPANY_PATTERNS = [
  (city: string, name: string) => `${city} Exotics`,
  (city: string, name: string) => `${name} Exotic Rentals`,
  (city: string, name: string) => `${city} Supercar Club`,
  (city: string, name: string) => `Prestige ${city}`,
  (city: string, name: string) => `${name} Luxury Rides`,
  (city: string, name: string) => `Elite Exotics ${city}`,
  (city: string, name: string) => `Apex Exotic Rentals`,
  (city: string, name: string) => `Velocity ${city}`,
  (city: string, name: string) => `Vantage Exotic`,
  (city: string, name: string) => `${name}'s Fleet`,
  (city: string, name: string) => `${city} Supercar Rentals`,
  (city: string, name: string) => `${name} Motorsports`,
  (city: string, name: string) => `${city} Dream Drives`,
  (city: string, name: string) => `Luxe Fleet ${city}`,
  (city: string, name: string) => `${name} Auto Luxury`,
  (city: string, name: string) => `${city} High Rollers`,
  (city: string, name: string) => `Platinum Exotics ${city}`,
  (city: string, name: string) => `${city} Hypercars`,
  (city: string, name: string) => `${name} Collection`,
  (city: string, name: string) => `RideRich ${city}`,
]

const SOURCES: Array<{ value: string; weight: number }> = [
  { value: 'apollo',   weight: 45 },
  { value: 'instagram', weight: 30 },
  { value: 'referral', weight: 15 },
  { value: 'paid',     weight: 10 },
]

const PIPELINE_STAGES = [
  { slug: 'new',       name: 'New Lead',    position: 1, color: '#6B7280', is_terminal: false, terminal_type: null },
  { slug: 'contacted', name: 'Contacted',   position: 2, color: '#3B82F6', is_terminal: false, terminal_type: null },
  { slug: 'engaged',   name: 'Engaged',     position: 3, color: '#8B5CF6', is_terminal: false, terminal_type: null },
  { slug: 'qualified', name: 'Qualified',   position: 4, color: '#F59E0B', is_terminal: false, terminal_type: null },
  { slug: 'won',       name: 'Closed Won',  position: 5, color: '#10B981', is_terminal: true,  terminal_type: 'won' },
  { slug: 'lost',      name: 'Closed Lost', position: 6, color: '#EF4444', is_terminal: true,  terminal_type: 'lost' },
]

// Stage distribution: new=200, contacted=120, engaged=80, qualified=60, won=20, lost=20
const STAGE_DISTRIBUTION: Record<string, number> = {
  new:       200,
  contacted: 120,
  engaged:   80,
  qualified: 60,
  won:       20,
  lost:      20,
}

const RED_FLAG_DISTRIBUTION: Array<{ code: string; reason: string; count: number }> = [
  { code: 'is_dealership',           reason: 'Company appears to be a dealership, not a rental operator', count: 20 },
  { code: 'below_fleet_minimum',     reason: 'Fleet size below 5-vehicle minimum for ICP', count: 30 },
  { code: 'experience_only_operator',reason: 'Operates experience drives only — not daily rental', count: 15 },
  { code: 'broker_not_operator',     reason: 'Acts as booking broker — does not own fleet', count: 15 },
  { code: 'wrong_icp',               reason: 'Does not match exotic/luxury rental ICP', count: 20 },
]

const ACTIVITY_TYPES = ['dm_sent', 'dm_opened', 'dm_replied', 'call_made', 'call_answered', 'form_submitted', 'score_changed', 'enriched'] as const

// ─────────────────────────────────────────────────────────────────────────────
// PSEUDO-RANDOM HELPERS (seeded for determinism)
// ─────────────────────────────────────────────────────────────────────────────

let _seed = 42
function seededRandom(): number {
  _seed = (_seed * 1664525 + 1013904223) & 0xffffffff
  return ((_seed >>> 0) / 0xffffffff)
}

function randInt(min: number, max: number): number {
  return Math.floor(seededRandom() * (max - min + 1)) + min
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(seededRandom() * arr.length)]
}

function pickWeighted<T extends { weight: number; value: string }>(items: T[]): string {
  const total = items.reduce((s, i) => s + i.weight, 0)
  let r = seededRandom() * total
  for (const item of items) {
    r -= item.weight
    if (r <= 0) return item.value
  }
  return items[items.length - 1].value
}

function daysAgo(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

function randomDate(minDaysAgo: number, maxDaysAgo: number): Date {
  return daysAgo(randInt(minDaysAgo, maxDaysAgo))
}

function uuid(): string {
  const hex = () => Math.floor(seededRandom() * 16).toString(16)
  return `${[...Array(8)].map(hex).join('')}-${[...Array(4)].map(hex).join('')}-4${[...Array(3)].map(hex).join('')}-${(8 | Math.floor(seededRandom() * 4)).toString(16)}${[...Array(3)].map(hex).join('')}-${[...Array(12)].map(hex).join('')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

function buildOwnerName(city: string): { firstName: string; lastName: string } {
  const tier1Cities = ['Miami', 'Miami Beach', 'Los Angeles', 'Beverly Hills']
  if (tier1Cities.includes(city)) {
    // More diverse demographics in prime markets
    const pool = seededRandom() < 0.4 ? FIRST_NAMES_LATIN : seededRandom() < 0.7 ? FIRST_NAMES_MENA : FIRST_NAMES_ANGLO
    const lastPool = seededRandom() < 0.4 ? LAST_NAMES_LATIN : seededRandom() < 0.7 ? LAST_NAMES_MENA : LAST_NAMES_ANGLO
    return { firstName: pick(pool), lastName: pick(lastPool) }
  }
  return { firstName: pick(FIRST_NAMES_ALL), lastName: pick(LAST_NAMES_ALL) }
}

function buildCompanyName(city: string, firstName: string): string {
  const pattern = pick(COMPANY_PATTERNS)
  return pattern(city, firstName)
}

function buildEmail(firstName: string, lastName: string, company: string): string {
  const domains = ['gmail.com', 'icloud.com', 'yahoo.com', `${company.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)}.com`]
  const local = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z]/g, '')}`
  return `${local}@${pick(domains)}`
}

function buildPhone(): string {
  const area = randInt(200, 999)
  return `+1${area}${randInt(2000000, 9999999)}`
}

function getStateForCity(city: string): string {
  const MAP: Record<string, string> = {
    'Miami': 'FL', 'Miami Beach': 'FL', 'Tampa': 'FL', 'Orlando': 'FL',
    'Las Vegas': 'NV',
    'Los Angeles': 'CA', 'Beverly Hills': 'CA', 'San Diego': 'CA', 'San Francisco': 'CA',
    'Scottsdale': 'AZ', 'Phoenix': 'AZ',
    'New York': 'NY', 'The Hamptons': 'NY',
    'Houston': 'TX', 'Dallas': 'TX', 'Austin': 'TX',
    'Atlanta': 'GA',
    'Washington DC': 'DC',
    'Chicago': 'IL',
    'Boston': 'MA',
    'Denver': 'CO',
    'Seattle': 'WA',
    'Nashville': 'TN',
    'Charlotte': 'NC',
  }
  return MAP[city] || 'FL'
}

interface ScoreBreakdownRaw {
  fleet_size: number
  fleet_tier: number
  vehicle_quality: string
  market_tier: number
  market_city: string
  operational_signals: string[]
  owner_named: boolean
  exotiq_tier: number
  // Point contributions
  fleet_size_pts: number
  vehicle_quality_pts: number
  market_tier_pts: number
  operational_signals_pts: number
  owner_named_pts: number
}

function buildScoreBreakdown(
  fleetSize: number,
  vehicleQuality: VehicleQuality,
  city: string,
  operationalSignals: string[],
  ownerNamed: boolean,
): { score: number; breakdown: ScoreBreakdownRaw } {
  const market = MARKET_TIERS[city] || { tier: 3 as const, modifier: 3 }

  // Fleet tier
  const fleetTier = fleetSize >= 25 ? 5 : fleetSize >= 15 ? 4 : fleetSize >= 8 ? 3 : fleetSize >= 5 ? 2 : 1
  const fleetPts = fleetTier === 5 ? 25 : fleetTier === 4 ? 20 : fleetTier === 3 ? 14 : fleetTier === 2 ? 8 : 2

  // Vehicle quality pts
  const qualityPts = vehicleQuality === 'exotic' ? 25 : vehicleQuality === 'ultra_luxury' ? 20 : vehicleQuality === 'luxury' ? 14 : 10

  // Market pts
  const marketPts = market.modifier

  // Operational signals
  const signalPts = Math.min(operationalSignals.length * 5, 20)

  // Owner named
  const ownerPts = ownerNamed ? 8 : 0

  const rawScore = fleetPts + qualityPts + marketPts + signalPts + ownerPts

  // Exotiq tier from raw score
  const exotiqTier = rawScore >= 80 ? 5 : rawScore >= 60 ? 4 : rawScore >= 40 ? 3 : rawScore >= 20 ? 2 : 1

  return {
    score: Math.min(100, rawScore),
    breakdown: {
      fleet_size: fleetSize,
      fleet_tier: fleetTier,
      vehicle_quality: vehicleQuality,
      market_tier: market.tier,
      market_city: city,
      operational_signals: operationalSignals,
      owner_named: ownerNamed,
      exotiq_tier: exotiqTier,
      fleet_size_pts: fleetPts,
      vehicle_quality_pts: qualityPts,
      market_tier_pts: marketPts,
      operational_signals_pts: signalPts,
      owner_named_pts: ownerPts,
    },
  }
}

const ALL_OPERATIONAL_SIGNALS = [
  'has_website',
  'has_booking_flow',
  'instagram_active',
  'google_reviews_present',
  'turo_listed',
  'responds_to_dms',
  'has_professional_photos',
  'has_pricing_page',
]

function pickOperationalSignals(count: number): string[] {
  const shuffled = [...ALL_OPERATIONAL_SIGNALS].sort(() => seededRandom() - 0.5)
  return shuffled.slice(0, count)
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAD BUILDER
// ─────────────────────────────────────────────────────────────────────────────

interface SeedLead {
  id: string
  tenant_id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  company_name: string
  company_location: string
  source: string
  source_detail: string | null
  score: number
  score_breakdown: ScoreBreakdownRaw
  icp_fit_score: number
  engagement_score: number
  red_flags: Array<{ code: string; reason: string; flagged_at: string }>
  status: string
  assigned_to: string | null
  stage_slug: string
  fleet_size: number
  vehicle_quality: VehicleQuality
  tags: string[]
  created_at: string
  updated_at: string
  last_activity_at: string | null
  converted_at: string | null
  first_contacted_at: string | null
  needs_enrichment: boolean
}

function buildWhaleLead(i: number): SeedLead {
  const city = pick(TIER1_CITIES)
  const { firstName, lastName } = buildOwnerName(city)
  const company = buildCompanyName(city, firstName)
  const fleetSize = randInt(25, 55)
  const vq: VehicleQuality = seededRandom() < 0.6 ? 'exotic' : 'ultra_luxury'
  const signals = pickOperationalSignals(randInt(5, 8))
  const ownerNamed = true
  const { score, breakdown } = buildScoreBreakdown(fleetSize, vq, city, signals, ownerNamed)

  const createdAt = randomDate(5, 60).toISOString()
  const lastActivity = randomDate(1, 10).toISOString()

  return {
    id: uuid(),
    tenant_id: TENANT_ID,
    first_name: firstName,
    last_name: lastName,
    email: buildEmail(firstName, lastName, company),
    phone: buildPhone(),
    company_name: company,
    company_location: `${city}, ${getStateForCity(city)}`,
    source: pickWeighted(SOURCES),
    source_detail: null,
    score: Math.max(80, Math.min(100, score)),
    score_breakdown: { ...breakdown, exotiq_tier: 5 },
    icp_fit_score: randInt(85, 100),
    engagement_score: randInt(70, 95),
    red_flags: [],
    status: 'qualified',
    assigned_to: 'gregory',
    stage_slug: pick(['qualified', 'won']),
    fleet_size: fleetSize,
    vehicle_quality: vq,
    tags: ['whale', 'tier-5', city.toLowerCase().replace(/\s+/g, '-')],
    created_at: createdAt,
    updated_at: lastActivity,
    last_activity_at: lastActivity,
    converted_at: null,
    first_contacted_at: randomDate(10, 40).toISOString(),
    needs_enrichment: seededRandom() < 0.4,
  }
}

function buildStrongLead(i: number): SeedLead {
  const city = seededRandom() < 0.55 ? pick(TIER1_CITIES) : pick(TIER2_CITIES)
  const { firstName, lastName } = buildOwnerName(city)
  const company = buildCompanyName(city, firstName)
  const fleetSize = randInt(15, 24)
  const vq: VehicleQuality = seededRandom() < 0.4 ? 'exotic' : seededRandom() < 0.7 ? 'ultra_luxury' : 'luxury'
  const signals = pickOperationalSignals(randInt(4, 7))
  const ownerNamed = seededRandom() < 0.8
  const { score, breakdown } = buildScoreBreakdown(fleetSize, vq, city, signals, ownerNamed)

  const createdAt = randomDate(5, 75).toISOString()
  const lastActivity = randomDate(3, 20).toISOString()

  const stageSlugs = ['contacted', 'engaged', 'qualified', 'won']
  const stagePick = pick(stageSlugs)

  return {
    id: uuid(),
    tenant_id: TENANT_ID,
    first_name: firstName,
    last_name: lastName,
    email: buildEmail(firstName, lastName, company),
    phone: buildPhone(),
    company_name: company,
    company_location: `${city}, ${getStateForCity(city)}`,
    source: pickWeighted(SOURCES),
    source_detail: null,
    score: Math.max(60, Math.min(79, score + randInt(0, 10))),
    score_breakdown: { ...breakdown, exotiq_tier: 4 },
    icp_fit_score: randInt(65, 85),
    engagement_score: randInt(50, 80),
    red_flags: [],
    status: stagePick === 'won' ? 'converted' : 'engaged',
    assigned_to: 'team',
    stage_slug: stagePick,
    fleet_size: fleetSize,
    vehicle_quality: vq,
    tags: ['tier-4', city.toLowerCase().replace(/\s+/g, '-')],
    created_at: createdAt,
    updated_at: lastActivity,
    last_activity_at: lastActivity,
    converted_at: stagePick === 'won' ? randomDate(1, 30).toISOString() : null,
    first_contacted_at: randomDate(15, 50).toISOString(),
    needs_enrichment: seededRandom() < 0.35,
  }
}

function buildSolidLead(i: number): SeedLead {
  const cityPool = seededRandom() < 0.35 ? TIER1_CITIES : seededRandom() < 0.65 ? TIER2_CITIES : TIER3_CITIES
  const city = pick(cityPool)
  const { firstName, lastName } = buildOwnerName(city)
  const company = buildCompanyName(city, firstName)
  const fleetSize = randInt(8, 14)
  const vq: VehicleQuality = seededRandom() < 0.25 ? 'exotic' : seededRandom() < 0.5 ? 'ultra_luxury' : seededRandom() < 0.8 ? 'luxury' : 'mixed'
  const signals = pickOperationalSignals(randInt(2, 5))
  const ownerNamed = seededRandom() < 0.6
  const { score, breakdown } = buildScoreBreakdown(fleetSize, vq, city, signals, ownerNamed)

  const createdAt = randomDate(10, 85).toISOString()
  const lastActivity = randomDate(7, 40).toISOString()

  const stageSlugs = ['new', 'contacted', 'engaged', 'qualified']
  const stagePick = pick(stageSlugs)

  return {
    id: uuid(),
    tenant_id: TENANT_ID,
    first_name: firstName,
    last_name: lastName,
    email: buildEmail(firstName, lastName, company),
    phone: buildPhone(),
    company_name: company,
    company_location: `${city}, ${getStateForCity(city)}`,
    source: pickWeighted(SOURCES),
    source_detail: null,
    score: Math.max(40, Math.min(59, score + randInt(-5, 10))),
    score_breakdown: { ...breakdown, exotiq_tier: 3 },
    icp_fit_score: randInt(45, 65),
    engagement_score: randInt(30, 55),
    red_flags: [],
    status: 'scored',
    assigned_to: 'team',
    stage_slug: stagePick,
    fleet_size: fleetSize,
    vehicle_quality: vq,
    tags: ['tier-3'],
    created_at: createdAt,
    updated_at: lastActivity,
    last_activity_at: lastActivity,
    converted_at: null,
    first_contacted_at: stagePick !== 'new' ? randomDate(20, 70).toISOString() : null,
    needs_enrichment: seededRandom() < 0.25,
  }
}

function buildLaterLead(i: number): SeedLead {
  const city = pick(ALL_CITIES)
  const { firstName, lastName } = buildOwnerName(city)
  const company = buildCompanyName(city, firstName)
  const fleetSize = randInt(5, 7)
  const vq: VehicleQuality = seededRandom() < 0.15 ? 'exotic' : seededRandom() < 0.4 ? 'ultra_luxury' : seededRandom() < 0.7 ? 'luxury' : 'mixed'
  const signals = pickOperationalSignals(randInt(1, 3))
  const ownerNamed = seededRandom() < 0.4
  const { score, breakdown } = buildScoreBreakdown(fleetSize, vq, city, signals, ownerNamed)

  const createdAt = randomDate(20, 89).toISOString()
  const lastActivity = randomDate(20, 80).toISOString()

  return {
    id: uuid(),
    tenant_id: TENANT_ID,
    first_name: firstName,
    last_name: lastName,
    email: buildEmail(firstName, lastName, company),
    phone: buildPhone(),
    company_name: company,
    company_location: `${city}, ${getStateForCity(city)}`,
    source: pickWeighted(SOURCES),
    source_detail: null,
    score: Math.max(20, Math.min(39, score + randInt(-10, 5))),
    score_breakdown: { ...breakdown, exotiq_tier: 2 },
    icp_fit_score: randInt(25, 45),
    engagement_score: randInt(10, 30),
    red_flags: [],
    status: 'new',
    assigned_to: 'team',
    stage_slug: seededRandom() < 0.85 ? 'new' : 'contacted',
    fleet_size: fleetSize,
    vehicle_quality: vq,
    tags: ['tier-2', 'low-priority'],
    created_at: createdAt,
    updated_at: lastActivity,
    last_activity_at: lastActivity,
    converted_at: null,
    first_contacted_at: null,
    needs_enrichment: false,
  }
}

function buildDisqualifiedLead(i: number, redFlagCode: string, redFlagReason: string): SeedLead {
  const city = pick(ALL_CITIES)
  const { firstName, lastName } = buildOwnerName(city)
  const company = buildCompanyName(city, firstName)
  const fleetSize = redFlagCode === 'below_fleet_minimum' ? randInt(1, 4) : randInt(3, 8)
  const vq: VehicleQuality = 'luxury'
  const signals = pickOperationalSignals(randInt(0, 2))
  const { score, breakdown } = buildScoreBreakdown(fleetSize, vq, city, signals, false)

  const createdAt = randomDate(30, 89).toISOString()

  return {
    id: uuid(),
    tenant_id: TENANT_ID,
    first_name: firstName,
    last_name: lastName,
    email: buildEmail(firstName, lastName, company),
    phone: buildPhone(),
    company_name: company,
    company_location: `${city}, ${getStateForCity(city)}`,
    source: pickWeighted(SOURCES),
    source_detail: null,
    score: Math.max(0, Math.min(19, score - randInt(10, 30))),
    score_breakdown: { ...breakdown, exotiq_tier: 1 },
    icp_fit_score: randInt(0, 20),
    engagement_score: 0,
    red_flags: [{
      code: redFlagCode,
      reason: redFlagReason,
      flagged_at: daysAgo(randInt(1, 60)).toISOString(),
    }],
    status: 'disqualified',
    assigned_to: null,
    stage_slug: seededRandom() < 0.8 ? 'new' : 'lost',
    fleet_size: fleetSize,
    vehicle_quality: vq,
    tags: ['disqualified', 'tier-1'],
    created_at: createdAt,
    updated_at: createdAt,
    last_activity_at: createdAt,
    converted_at: null,
    first_contacted_at: null,
    needs_enrichment: false,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY BUILDER
// ─────────────────────────────────────────────────────────────────────────────

interface SeedActivity {
  id: string
  tenant_id: string
  lead_id: string
  activity_type: string
  channel: string | null
  metadata: Record<string, unknown>
  created_at: string
}

function buildActivities(lead: SeedLead, tier: 1 | 2 | 3 | 4 | 5): SeedActivity[] {
  if (tier <= 2) return []

  const count = tier === 5 ? randInt(5, 8) : tier === 4 ? randInt(3, 6) : randInt(2, 4)
  const activities: SeedActivity[] = []

  const typesForTier = tier === 5
    ? ['call_made', 'call_answered', 'dm_sent', 'dm_replied', 'dm_opened', 'score_changed', 'enriched']
    : ['dm_sent', 'dm_opened', 'dm_replied', 'score_changed', 'enriched', 'form_submitted']

  // Sort activities in chronological order across 90 days
  const daysAgoValues = Array.from({ length: count }, () => randInt(1, 85)).sort((a, b) => b - a)

  for (let i = 0; i < count; i++) {
    const type = pick(typesForTier)
    const channel = type.startsWith('dm') ? 'instagram' : type.startsWith('call') ? 'phone' : type === 'form_submitted' ? 'web' : null

    activities.push({
      id: uuid(),
      tenant_id: TENANT_ID,
      lead_id: lead.id,
      activity_type: type,
      channel,
      metadata: {
        auto: true,
        ...(type === 'dm_sent' && { template: 'outreach_v2', instagram_handle: `@${lead.first_name?.toLowerCase()}exotics` }),
        ...(type === 'call_made' && { duration_seconds: randInt(0, 300), outcome: seededRandom() < 0.5 ? 'no_answer' : 'left_voicemail' }),
        ...(type === 'call_answered' && { duration_seconds: randInt(120, 900), sentiment: pick(['positive', 'neutral', 'interested']) }),
        ...(type === 'score_changed' && { from: randInt(0, 50), to: lead.score }),
        ...(type === 'enriched' && { provider: 'saul_web', confidence: randInt(60, 95) }),
      },
      created_at: daysAgo(daysAgoValues[i]).toISOString(),
    })
  }

  return activities
}

// ─────────────────────────────────────────────────────────────────────────────
// ENRICHMENT BUILDER
// ─────────────────────────────────────────────────────────────────────────────

interface SeedEnrichment {
  id: string
  tenant_id: string
  lead_id: string
  provider: string
  status: string
  request_data: Record<string, unknown>
  response_data: Record<string, unknown>
  confidence_score: number
  cost_cents: number
  tokens_used: number
  requested_at: string
  completed_at: string
}

function buildEnrichment(lead: SeedLead): SeedEnrichment {
  const requestedAt = daysAgo(randInt(5, 40))
  const completedAt = new Date(requestedAt.getTime() + randInt(3000, 30000))
  const vehicles = QUALITY_VEHICLE_EXAMPLES[lead.vehicle_quality]
  const igFollowers = randInt(1000, 80000)

  return {
    id: uuid(),
    tenant_id: TENANT_ID,
    lead_id: lead.id,
    provider: 'saul_web',
    status: 'completed',
    request_data: {
      company_name: lead.company_name,
      company_location: lead.company_location,
      instagram_handle: `@${lead.first_name?.toLowerCase()}${lead.company_name?.toLowerCase().replace(/[^a-z]/g, '').slice(0, 8)}`,
    },
    response_data: {
      ig_followers_approx: igFollowers,
      turo_listed: seededRandom() < 0.4,
      has_booking_flow: seededRandom() < 0.65,
      google_review_count_approx: randInt(5, 400),
      named_owner: `${lead.first_name} ${lead.last_name}`,
      vehicle_quality_detected: lead.vehicle_quality === 'exotic' ? 'luxury' : lead.vehicle_quality === 'ultra_luxury' ? 'premium' : 'standard',
      fleet_size_estimate_low: Math.max(1, lead.fleet_size - randInt(1, 3)),
      fleet_size_estimate_high: lead.fleet_size + randInt(0, 3),
      experience_only_risk: false,
      detected_vehicles: vehicles.slice(0, randInt(2, 4)),
    },
    confidence_score: randInt(62, 96),
    cost_cents: randInt(10, 50),
    tokens_used: randInt(500, 3000),
    requested_at: requestedAt.toISOString(),
    completed_at: completedAt.toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE ASSIGNMENT LOGIC
// ─────────────────────────────────────────────────────────────────────────────

function assignStagesToLeads(leads: SeedLead[], stageIdMap: Record<string, string>): void {
  // Allocate stage slugs by desired distribution, then assign to leads
  const stageSlugs = Object.entries(STAGE_DISTRIBUTION).flatMap(([slug, count]) => Array(count).fill(slug))

  // Shuffle deterministically
  const shuffled = stageSlugs.sort(() => seededRandom() - 0.5)

  // But we also want tiers to map reasonably to stages
  // Won leads should be tier 4-5; lost leads should be tier 1-2
  const wonLeads  = leads.filter(l => l.score >= 60).slice(0, 20)
  const lostLeads = leads.filter(l => l.score < 40).slice(0, 20)
  const newLeads  = leads.filter(l => !wonLeads.includes(l) && !lostLeads.includes(l))

  const distribute = (pool: SeedLead[], targetSlugs: string[]) => {
    pool.forEach((lead, idx) => {
      const slug = targetSlugs[idx % targetSlugs.length]
      lead.stage_slug = slug
      if (slug === 'won') {
        lead.converted_at = lead.converted_at || randomDate(1, 30).toISOString()
        lead.status = 'converted'
        lead.assigned_to = lead.score >= 80 ? 'gregory' : 'team'
      }
      if (slug === 'lost') {
        lead.status = 'lost'
      }
    })
  }

  distribute(wonLeads, ['won'])
  distribute(lostLeads, ['lost'])

  // Distribute remaining leads across other stages
  const remaining = leads.filter(l => l.stage_slug !== 'won' && l.stage_slug !== 'lost')
  const otherSlugs = ['new', 'contacted', 'engaged', 'qualified']
  const otherDist  = [200, 120, 80, 60]
  let otherIdx = 0
  otherSlugs.forEach((slug, sIdx) => {
    const count = otherDist[sIdx]
    for (let i = 0; i < count && otherIdx < remaining.length; i++, otherIdx++) {
      remaining[otherIdx].stage_slug = slug
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SEED FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

export async function seed() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  // ── 1. TENANT ──────────────────────────────────────────────────────────────
  console.log('Creating Exotiq tenant...')
  const { error: tenantErr } = await supabase
    .from('tenants')
    .upsert({
      id:   TENANT_ID,
      name: 'Exotiq',
      slug: 'exotiq',
      settings: {
        industry:         'exotic_car_rental',
        scoring_model:    'exotiq_v1',
        outreach_channel: 'instagram_dm',
        timezone:         'America/New_York',
      },
      branding: {
        company_name:    'Exotiq',
        primary_color:   '#D4AF37',
        dashboard_title: 'Exotiq LeadGen',
      },
      ghl_location_id: null,
      ghl_api_key:     null,
    }, { onConflict: 'id' })

  if (tenantErr) throw new Error(`Tenant upsert failed: ${tenantErr.message}`)
  console.log(`  ✓ Tenant: Exotiq (id: ${TENANT_ID})`)

  // ── 2. PIPELINE STAGES ─────────────────────────────────────────────────────
  console.log('Creating pipeline stages...')
  const stageIdMap: Record<string, string> = {}

  for (const stage of PIPELINE_STAGES) {
    const stageId = uuid()
    const { error } = await supabase
      .from('pipeline_stages')
      .upsert({
        id:            stageId,
        tenant_id:     TENANT_ID,
        name:          stage.name,
        slug:          stage.slug,
        position:      stage.position,
        color:         stage.color,
        is_terminal:   stage.is_terminal,
        terminal_type: stage.terminal_type,
      }, { onConflict: 'id' })

    if (error) {
      // Fetch existing if already present (for idempotency)
      const { data: existing } = await supabase
        .from('pipeline_stages')
        .select('id, slug')
        .eq('tenant_id', TENANT_ID)
        .eq('slug', stage.slug)
        .single()
      if (existing) {
        stageIdMap[stage.slug] = existing.id
      } else {
        throw new Error(`Stage insert failed for ${stage.slug}: ${error.message}`)
      }
    } else {
      stageIdMap[stage.slug] = stageId
    }
  }
  console.log(`  ✓ ${PIPELINE_STAGES.length} pipeline stages created`)

  // ── 3. ICP PROFILE ─────────────────────────────────────────────────────────
  console.log('Creating ICP profile...')
  const { error: icpErr } = await supabase
    .from('icp_profiles')
    .upsert({
      id:        '00000000-0000-0000-0000-000000000002',
      tenant_id: TENANT_ID,
      name:      'Exotiq ICP v1 — Independent Exotic Car Rental Operator',
      is_active: true,
      criteria: {
        description: 'Independent exotic/luxury car rental operators, 5+ vehicles, US-based',
        market_tiers: {
          tier_1: { cities: TIER1_CITIES, modifier: 15 },
          tier_2: { cities: TIER2_CITIES, modifier: 8  },
          tier_3: { cities: TIER3_CITIES, modifier: 3  },
        },
        fleet_size: {
          minimum:    5,
          ideal_min: 15,
          ideal_max: 40,
          whale_min: 25,
        },
        vehicle_quality: {
          tiers:    ['exotic', 'ultra_luxury', 'luxury', 'mixed'],
          ideal:    ['exotic', 'ultra_luxury'],
          acceptable: ['luxury', 'mixed'],
        },
        weights: {
          fleet_size:           0.25,
          vehicle_quality:      0.25,
          market_tier:          0.20,
          operational_signals:  0.20,
          owner_named:          0.10,
        },
        signals: [
          'has_website',
          'has_booking_flow',
          'instagram_active',
          'google_reviews_present',
          'turo_listed',
          'responds_to_dms',
          'has_professional_photos',
          'has_pricing_page',
        ],
        negative_signals: [
          'is_dealership',
          'experience_only_operator',
          'broker_not_operator',
          'below_fleet_minimum',
          'wrong_icp',
        ],
        scoring_tiers: {
          tier_5: { min: 80, max: 100, label: 'Whale',   assigned_to: 'gregory', channel: 'phone' },
          tier_4: { min: 60, max: 79,  label: 'Strong',  assigned_to: 'team',    channel: 'personalized_dm' },
          tier_3: { min: 40, max: 59,  label: 'Solid',   assigned_to: 'team',    channel: 'template_d' },
          tier_2: { min: 20, max: 39,  label: 'Later',   assigned_to: 'team',    channel: 'low_priority' },
          tier_1: { min: 0,  max: 19,  label: 'Not Now', assigned_to: null,      channel: 'park' },
        },
      },
    }, { onConflict: 'id' })

  if (icpErr) throw new Error(`ICP profile upsert failed: ${icpErr.message}`)
  console.log('  ✓ ICP profile created')

  // ── 4. BUILD LEADS IN MEMORY ───────────────────────────────────────────────
  console.log('Building 500 leads in memory...')

  const allLeads: SeedLead[] = []

  // Tier 5 — 15 whales
  for (let i = 0; i < 15; i++) allLeads.push(buildWhaleLead(i))

  // Tier 4 — 60 strong
  for (let i = 0; i < 60; i++) allLeads.push(buildStrongLead(i))

  // Tier 3 — 150 solid
  for (let i = 0; i < 150; i++) allLeads.push(buildSolidLead(i))

  // Tier 2 — 175 later
  for (let i = 0; i < 175; i++) allLeads.push(buildLaterLead(i))

  // Tier 1/disqualified — 100 leads
  let rfIdx = 0
  for (const rf of RED_FLAG_DISTRIBUTION) {
    for (let j = 0; j < rf.count; j++) {
      allLeads.push(buildDisqualifiedLead(rfIdx++, rf.code, rf.reason))
    }
  }

  // Assign stages deterministically
  assignStagesToLeads(allLeads, stageIdMap)

  console.log(`  ✓ ${allLeads.length} leads built in memory`)

  // ── 5. INSERT LEADS ────────────────────────────────────────────────────────
  console.log('Creating 500 leads...')

  // Map to DB columns; strip helper fields
  const dbLeads = allLeads.map(lead => ({
    id:               lead.id,
    tenant_id:        lead.tenant_id,
    first_name:       lead.first_name,
    last_name:        lead.last_name,
    email:            lead.email,
    phone:            lead.phone,
    company_name:     lead.company_name,
    company_location: lead.company_location,
    company_industry: 'exotic_car_rental',
    source:           lead.source,
    source_detail:    lead.source_detail,
    score:            lead.score,
    score_breakdown:  lead.score_breakdown,
    icp_fit_score:    lead.icp_fit_score,
    engagement_score: lead.engagement_score,
    red_flags:        lead.red_flags,
    status:           lead.status,
    assigned_to:      lead.assigned_to,
    stage_id:         stageIdMap[lead.stage_slug] || stageIdMap['new'],
    ghl_contact_id:   null,
    first_contacted_at: lead.first_contacted_at,
    last_activity_at: lead.last_activity_at,
    converted_at:     lead.converted_at,
    created_at:       lead.created_at,
    updated_at:       lead.updated_at,
  }))

  const BATCH_SIZE = 100
  let inserted = 0

  for (let i = 0; i < dbLeads.length; i += BATCH_SIZE) {
    const batch = dbLeads.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('leads').upsert(batch, { onConflict: 'id' })
    if (error) throw new Error(`Leads batch insert failed (offset ${i}): ${error.message}`)
    inserted += batch.length
    console.log(`  ✓ ${inserted}/${dbLeads.length} leads inserted`)
  }

  // ── 6. INSERT ACTIVITIES ───────────────────────────────────────────────────
  console.log('Creating activities for Tier 3-5 leads...')

  const allActivities: SeedActivity[] = []

  allLeads.forEach(lead => {
    const tier = lead.score_breakdown.exotiq_tier as 1 | 2 | 3 | 4 | 5
    const acts = buildActivities(lead, tier)
    allActivities.push(...acts)
  })

  let activitiesInserted = 0
  for (let i = 0; i < allActivities.length; i += BATCH_SIZE) {
    const batch = allActivities.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('lead_activities').upsert(batch, { onConflict: 'id' })
    if (error) throw new Error(`Activities batch insert failed (offset ${i}): ${error.message}`)
    activitiesInserted += batch.length
  }
  console.log(`  ✓ ${activitiesInserted} activities inserted`)

  // ── 7. INSERT ENRICHMENTS ──────────────────────────────────────────────────
  console.log('Creating saul_web enrichment records (30% of leads)...')

  const leadsToEnrich = allLeads.filter(l => l.needs_enrichment || l.score >= 60)
  const enrichments = leadsToEnrich.map(buildEnrichment)

  let enrichmentsInserted = 0
  for (let i = 0; i < enrichments.length; i += BATCH_SIZE) {
    const batch = enrichments.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('enrichments').upsert(batch, { onConflict: 'id' })
    if (error) throw new Error(`Enrichments batch insert failed (offset ${i}): ${error.message}`)
    enrichmentsInserted += batch.length
  }
  console.log(`  ✓ ${enrichmentsInserted} enrichment records inserted`)

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  const tier5  = allLeads.filter(l => l.score >= 80).length
  const tier4  = allLeads.filter(l => l.score >= 60 && l.score < 80).length
  const tier3  = allLeads.filter(l => l.score >= 40 && l.score < 60).length
  const tier2  = allLeads.filter(l => l.score >= 20 && l.score < 40).length
  const tier1  = allLeads.filter(l => l.score < 20).length

  const stageCount = Object.fromEntries(
    Object.keys(STAGE_DISTRIBUTION).map(slug => [
      slug, allLeads.filter(l => l.stage_slug === slug).length,
    ])
  )

  const sourceCount = Object.fromEntries(
    SOURCES.map(s => [s.value, allLeads.filter(l => l.source === s.value).length])
  )

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  EXOTIQ SEED COMPLETE')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  Total leads:       ${allLeads.length}`)
  console.log(`  Tier 5 (Whale):    ${tier5}   (score 80-100, assigned: gregory)`)
  console.log(`  Tier 4 (Strong):   ${tier4}   (score 60-79)`)
  console.log(`  Tier 3 (Solid):    ${tier3}  (score 40-59)`)
  console.log(`  Tier 2 (Later):    ${tier2}  (score 20-39)`)
  console.log(`  Tier 1 (Not Now):  ${tier1}  (score 0-19)`)
  console.log('  ───────────────────────────────────────────')
  console.log('  Pipeline stages:')
  Object.entries(stageCount).forEach(([s, c]) => console.log(`    ${s.padEnd(12)} ${c}`))
  console.log('  ───────────────────────────────────────────')
  console.log('  Sources:')
  Object.entries(sourceCount).forEach(([s, c]) => console.log(`    ${s.padEnd(12)} ${c}`))
  console.log('  ───────────────────────────────────────────')
  console.log(`  Activities:        ${activitiesInserted}`)
  console.log(`  Enrichments:       ${enrichmentsInserted}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRYPOINT
// ─────────────────────────────────────────────────────────────────────────────

seed().catch(err => {
  console.error('\n✗ Seed failed:', err.message)
  process.exit(1)
})
