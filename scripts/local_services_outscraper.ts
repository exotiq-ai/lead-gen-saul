import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  LOCAL_SERVICE_VERTICALS,
  LOCAL_SERVICES_PIPELINE_STAGES,
  LOCAL_SERVICES_TENANT_ID,
  LOCAL_SERVICES_TENANT_SLUG,
  type LocalServiceVerticalKey,
} from '../src/lib/local-services/config'

loadEnv({ path: path.resolve(process.cwd(), '.env.local') })
loadEnv({ path: path.resolve(process.cwd(), '.env') })

type AnyRecord = Record<string, unknown>

type NormalizedLead = {
  company_name: string
  phone: string | null
  phone_raw: string | null
  company_domain: string | null
  website_url: string | null
  company_location: string | null
  city: string | null
  state: string | null
  country: string | null
  company_industry: string
  vertical_key: LocalServiceVerticalKey
  vertical_label: string
  source_query: string
  source_run_id: string
  source_record_id: string | null
  google_place_id: string | null
  maps_url: string | null
  rating: number | null
  review_count: number | null
  primary_category: string | null
  latitude: number | null
  longitude: number | null
  completeness_score: number
  raw: AnyRecord
}

type CliOptions = {
  action: 'seed' | 'search' | 'import-file' | 'sync-ghl' | 'help'
  vertical?: LocalServiceVerticalKey
  location?: string
  city?: string
  state?: string
  maxResults: number
  perQueryLimit: number
  outDir: string
  input?: string
  live: boolean
  createOutreach: boolean
  syncGhl: boolean
}

const BATCH_SIZE = 100
const DEFAULT_TENANT_NAME = 'Ask Saul'
const DEFAULT_MARKET = 'Denver, CO'
const DEFAULT_OUT_DIR = 'output/local-services'

function usage(): never {
  console.log(`Local Services Outscraper lead ingestion

Usage:
  tsx scripts/local_services_outscraper.ts seed [--live]
  tsx scripts/local_services_outscraper.ts search --vertical hvac --location "Denver, CO" [--max-results 50] [--live] [--sync-ghl]
  tsx scripts/local_services_outscraper.ts import-file --input output.json [--live] [--sync-ghl]
  tsx scripts/local_services_outscraper.ts sync-ghl [--input normalized.json] [--live]

Safe defaults:
  - Without --live, the script writes JSON/JSONL/CSV artifacts only and does not mutate Supabase/GHL.
  - OUTSCRAPER_API_KEY is required only for search.
  - SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY are required for --live seed/import.
  - GHL sync is dry-run unless --live and GHL_LOCAL_SERVICES_API_KEY/GHL_LOCAL_SERVICES_LOCATION_ID (or GHL_API_KEY/GHL_LOCATION_ID) are configured.

Examples:
  tsx scripts/local_services_outscraper.ts seed --live
  tsx scripts/local_services_outscraper.ts search --vertical hvac --location "Denver, CO" --max-results 50
  tsx scripts/local_services_outscraper.ts search --vertical hvac --location "Denver, CO" --max-results 50 --live --sync-ghl
`)
  process.exit(0)
}

function parseArgs(argv: string[]): CliOptions {
  const action = (argv[2] ?? 'help') as CliOptions['action']
  const opts: CliOptions = {
    action,
    maxResults: 50,
    perQueryLimit: 50,
    outDir: DEFAULT_OUT_DIR,
    live: false,
    createOutreach: true,
    syncGhl: false,
  }
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i]
    const next = argv[i + 1]
    if (a === '--vertical') opts.vertical = next as LocalServiceVerticalKey, i++
    else if (a === '--location') opts.location = next, i++
    else if (a === '--city') opts.city = next, i++
    else if (a === '--state') opts.state = next, i++
    else if (a === '--max-results') opts.maxResults = Number(next), i++
    else if (a === '--per-query-limit') opts.perQueryLimit = Number(next), i++
    else if (a === '--out-dir') opts.outDir = next, i++
    else if (a === '--input') opts.input = next, i++
    else if (a === '--live') opts.live = true
    else if (a === '--no-outreach') opts.createOutreach = false
    else if (a === '--sync-ghl') opts.syncGhl = true
    else if (a === '--help' || a === '-h') usage()
    else throw new Error(`Unknown arg: ${a}`)
  }
  if (!['seed', 'search', 'import-file', 'sync-ghl', 'help'].includes(action)) usage()
  if (action === 'help') usage()
  return opts
}

function requireSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function safeSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
}

function parseLocation(location: string) {
  const parts = location.split(',').map((p) => p.trim()).filter(Boolean)
  return { city: parts[0] ?? null, state: parts[1] ?? null, country: parts[2] ?? 'US' }
}

function getString(obj: AnyRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return null
}

function getNumber(obj: AnyRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const n = Number(value.replace(/,/g, ''))
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

function normalizePhone(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  if (raw.trim().startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`
  return null
}

function normalizeDomain(raw: string | null): { domain: string | null; url: string | null } {
  if (!raw) return { domain: null, url: null }
  let s = raw.trim()
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  try {
    const u = new URL(s)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    if (!host || host.includes('google.') || host.includes('facebook.') || host.includes('yelp.')) {
      return { domain: null, url: null }
    }
    return { domain: host, url: `${u.protocol}//${host}${u.pathname === '/' ? '' : u.pathname}` }
  } catch {
    return { domain: null, url: null }
  }
}

function normalizeCompanyName(s: string) {
  return s
    .toLowerCase()
    .replace(/\b(llc|inc|co|company|corp|corporation|ltd)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function dedupeKey(l: NormalizedLead) {
  return [
    l.google_place_id ? `place:${l.google_place_id}` : '',
    l.phone ? `phone:${l.phone}` : '',
    l.company_domain ? `domain:${l.company_domain}` : '',
    `namecity:${normalizeCompanyName(l.company_name)}:${(l.city ?? '').toLowerCase()}`,
  ].filter(Boolean)
}

function leadCompletenessScore(l: Omit<NormalizedLead, 'completeness_score'>) {
  let score = 20
  if (l.phone) score += 35
  if (l.company_domain) score += 20
  if (l.company_location) score += 15
  if (l.rating != null) score += 5
  if ((l.review_count ?? 0) > 0) score += 5
  return Math.min(100, score)
}

function flattenOutscraperPayload(payload: unknown): AnyRecord[] {
  const out: AnyRecord[] = []
  const walk = (x: unknown) => {
    if (Array.isArray(x)) {
      for (const item of x) walk(item)
      return
    }
    if (x && typeof x === 'object') {
      const obj = x as AnyRecord
      if (typeof obj.name === 'string' || typeof obj.title === 'string' || typeof obj.business_name === 'string') {
        out.push(obj)
        return
      }
      for (const key of ['data', 'results', 'result', 'items']) {
        if (key in obj) walk(obj[key])
      }
    }
  }
  walk(payload)
  return out
}

function normalizeRecord(raw: AnyRecord, ctx: { vertical: LocalServiceVerticalKey; location: string; query: string; runId: string }): NormalizedLead | null {
  const vertical = LOCAL_SERVICE_VERTICALS[ctx.vertical]
  const companyName = getString(raw, ['name', 'business_name', 'title', 'display_name'])
  if (!companyName) return null

  const phoneRaw = getString(raw, ['phone', 'phone_1', 'phone_number', 'international_phone_number'])
  const phone = normalizePhone(phoneRaw)
  const siteRaw = getString(raw, ['site', 'website', 'domain', 'url'])
  const { domain, url } = normalizeDomain(siteRaw)
  const fallbackLocation = parseLocation(ctx.location)
  const city = getString(raw, ['city']) ?? fallbackLocation.city
  const state = getString(raw, ['state', 'province']) ?? fallbackLocation.state
  const country = getString(raw, ['country_code', 'country']) ?? fallbackLocation.country
  const address = getString(raw, ['full_address', 'address', 'street_address', 'formatted_address'])
  const companyLocation = address ?? ([city, state].filter(Boolean).join(', ') || null)
  const rating = getNumber(raw, ['rating', 'reviews_rating'])
  const reviewCount = getNumber(raw, ['reviews', 'review_count', 'reviews_count'])
  const sourceId = getString(raw, ['place_id', 'google_id', 'id', 'os_id'])
  const placeId = getString(raw, ['place_id'])
  const category = getString(raw, ['category', 'type', 'primary_type', 'business_category'])
  const mapsUrl = getString(raw, ['location_link', 'maps_url', 'google_maps_url', 'place_link'])

  const base = {
    company_name: companyName.trim(),
    phone,
    phone_raw: phoneRaw,
    company_domain: domain,
    website_url: url,
    company_location: companyLocation,
    city,
    state,
    country,
    company_industry: vertical.label,
    vertical_key: vertical.key,
    vertical_label: vertical.label,
    source_query: ctx.query,
    source_run_id: ctx.runId,
    source_record_id: sourceId,
    google_place_id: placeId,
    maps_url: mapsUrl,
    rating,
    review_count: reviewCount,
    primary_category: category,
    latitude: getNumber(raw, ['latitude', 'lat']),
    longitude: getNumber(raw, ['longitude', 'lng', 'lon']),
    raw,
  }
  return { ...base, completeness_score: leadCompletenessScore(base) }
}

function renderTemplate(template: string, lead: NormalizedLead) {
  const city = lead.city ?? lead.company_location?.split(',')[0]?.trim() ?? 'your area'
  return template
    .replaceAll('{city}', city)
    .replaceAll('{service_type}', LOCAL_SERVICE_VERTICALS[lead.vertical_key].serviceType)
    .replaceAll('{company_name}', lead.company_name)
    .replaceAll('{demo_number}', process.env.LOCAL_SERVICES_DEMO_NUMBER ?? '[demo number]')
}

async function seedTenant(live: boolean) {
  const sequenceSteps = Object.values(LOCAL_SERVICE_VERTICALS).flatMap((v) => [
    {
      vertical: v.key,
      variant: `${v.key}_first_touch_control`,
      label: `${v.label} — first touch`,
      channel: 'sms',
      body: v.outreach.firstTouch,
      requires_reply_before_next: true,
    },
    {
      vertical: v.key,
      variant: `${v.key}_yes_reply_control`,
      label: `${v.label} — yes reply offer`,
      channel: 'sms',
      body: v.outreach.yesReply,
    },
    {
      vertical: v.key,
      variant: `${v.key}_demo_number_reply`,
      label: `${v.label} — demo number handoff`,
      channel: 'sms',
      body: v.outreach.demoReply,
    },
  ])

  if (!live) {
    console.log('[dry-run] would upsert tenant, stages, ICP profile, and outreach sequence')
    console.log(JSON.stringify({ tenant_id: LOCAL_SERVICES_TENANT_ID, sequenceSteps: sequenceSteps.length }, null, 2))
    return
  }

  const supabase = requireSupabase()
  const { error: tenantErr } = await supabase.from('tenants').upsert(
    {
      id: LOCAL_SERVICES_TENANT_ID,
      name: DEFAULT_TENANT_NAME,
      slug: LOCAL_SERVICES_TENANT_SLUG,
      settings: {
        industry: 'local_services',
        lead_groups: Object.values(LOCAL_SERVICE_VERTICALS).map((v) => ({ key: v.key, label: v.label, queries: v.queries })),
        outreach_channel: 'sendblue_ghl_sms_imessage',
        timezone: 'America/Denver',
        compliance: {
          outbound_requires_sendblue_outbound_plan: true,
          twilio_a2p_not_required_for_internal_telegram_alerts: true,
          stop_on_negative_or_opt_out: true,
        },
      },
      branding: {
        company_name: 'Local Services by Saul',
        primary_color: '#2563eb',
        dashboard_title: 'Local Services LeadGen',
      },
      ghl_location_id: process.env.GHL_LOCAL_SERVICES_LOCATION_ID ?? null,
      ghl_api_key: null,
    },
    { onConflict: 'id' },
  )
  if (tenantErr) throw new Error(`tenant upsert failed: ${tenantErr.message}`)

  const stageIdBySlug: Record<string, string> = {}
  for (const stage of LOCAL_SERVICES_PIPELINE_STAGES) {
    const existing = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('tenant_id', LOCAL_SERVICES_TENANT_ID)
      .eq('slug', stage.slug)
      .maybeSingle()
    const id = existing.data?.id
    const { data, error } = await supabase
      .from('pipeline_stages')
      .upsert({ ...stage, id, tenant_id: LOCAL_SERVICES_TENANT_ID }, { onConflict: 'id' })
      .select('id, slug')
      .single()
    if (error) throw new Error(`stage upsert failed (${stage.slug}): ${error.message}`)
    stageIdBySlug[data.slug] = data.id
  }

  const { error: icpErr } = await supabase.from('icp_profiles').upsert(
    {
      id: '22222222-2222-2222-2222-222222222223',
      tenant_id: LOCAL_SERVICES_TENANT_ID,
      name: 'Local Services ICP — map-sourced owner operators',
      is_active: true,
      criteria: {
        required: ['business_name', 'phone_or_website', 'local_service_category'],
        preferred: ['phone', 'website', 'rating_4_plus', 'review_count_10_plus', 'non_franchise'],
        verticals: Object.values(LOCAL_SERVICE_VERTICALS).map((v) => v.key),
        scoring: 'contactability + local fit + review proof; no AI spend required',
      },
    },
    { onConflict: 'id' },
  )
  if (icpErr) throw new Error(`ICP upsert failed: ${icpErr.message}`)

  const { error: seqErr } = await supabase.from('outreach_sequences').upsert(
    {
      id: '22222222-2222-2222-2222-222222222224',
      tenant_id: LOCAL_SERVICES_TENANT_ID,
      name: 'Local Services — Sendblue/GHL control sequence',
      slug: 'local-services-sendblue-control',
      description: 'Two-step cold text sequence: verify active service area, then concise 24/7 phone-agent pay-per-close offer. GHL/Sendblue execution only after approval.',
      steps: sequenceSteps,
      is_active: true,
    },
    { onConflict: 'id' },
  )
  if (seqErr) throw new Error(`sequence upsert failed: ${seqErr.message}`)

  console.log(`✓ seeded ${DEFAULT_TENANT_NAME} tenant (${LOCAL_SERVICES_TENANT_ID})`)
  console.log(`✓ stages: ${Object.keys(stageIdBySlug).join(', ')}`)
  console.log(`✓ outreach sequence steps: ${sequenceSteps.length}`)
}

async function queryOutscraper(query: string, limit: number) {
  const apiKey = process.env.OUTSCRAPER_API_KEY
  if (!apiKey) throw new Error('OUTSCRAPER_API_KEY is required for search')
  const base = (process.env.OUTSCRAPER_BASE_URL ?? 'https://api.outscraper.cloud').replace(/\/$/, '')
  const endpoint = process.env.OUTSCRAPER_MAPS_PATH ?? '/maps/search-v3'
  const url = new URL(`${base}${endpoint}`)
  url.searchParams.set('query', query)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('async', 'false')
  const res = await fetch(url, {
    headers: {
      'X-API-KEY': apiKey,
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  })
  const text = await res.text()
  let payload: unknown
  try { payload = JSON.parse(text) } catch { payload = text }
  if (!res.ok) throw new Error(`Outscraper ${res.status}: ${typeof payload === 'string' ? payload.slice(0, 500) : JSON.stringify(payload).slice(0, 500)}`)
  return payload
}

function writeArtifacts(outDir: string, runId: string, leads: NormalizedLead[], rawPayloads: unknown[]) {
  ensureDir(outDir)
  const jsonPath = path.join(outDir, `${runId}.normalized.json`)
  const jsonlPath = path.join(outDir, `${runId}.normalized.jsonl`)
  const csvPath = path.join(outDir, `${runId}.normalized.csv`)
  const rawPath = path.join(outDir, `${runId}.raw.json`)
  fs.writeFileSync(jsonPath, JSON.stringify(leads, null, 2))
  fs.writeFileSync(jsonlPath, leads.map((l) => JSON.stringify(l)).join('\n') + (leads.length ? '\n' : ''))
  fs.writeFileSync(rawPath, JSON.stringify(rawPayloads, null, 2))
  const headers = ['company_name', 'phone', 'company_domain', 'company_location', 'city', 'state', 'company_industry', 'rating', 'review_count', 'source_query', 'maps_url', 'completeness_score']
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  fs.writeFileSync(csvPath, [headers.join(','), ...leads.map((l) => headers.map((h) => esc((l as unknown as AnyRecord)[h])).join(','))].join('\n'))
  return { jsonPath, jsonlPath, csvPath, rawPath }
}

async function search(opts: CliOptions) {
  if (!opts.vertical || !LOCAL_SERVICE_VERTICALS[opts.vertical]) throw new Error('--vertical is required and must be one of: ' + Object.keys(LOCAL_SERVICE_VERTICALS).join(', '))
  const location = opts.location ?? ([opts.city, opts.state].filter(Boolean).join(', ') || DEFAULT_MARKET)
  const vertical = LOCAL_SERVICE_VERTICALS[opts.vertical]
  const runId = `${nowStamp()}_${vertical.key}_${safeSlug(location)}`
  const rawPayloads: unknown[] = []
  const normalized: NormalizedLead[] = []
  const seen = new Set<string>()

  for (const baseQuery of vertical.queries) {
    if (normalized.length >= opts.maxResults) break
    const query = `${baseQuery}, ${location}, US`
    console.log(`Outscraper: ${query}`)
    const payload = await queryOutscraper(query, Math.min(opts.perQueryLimit, opts.maxResults))
    rawPayloads.push({ query, payload })
    for (const item of flattenOutscraperPayload(payload)) {
      const lead = normalizeRecord(item, { vertical: vertical.key, location, query, runId })
      if (!lead) continue
      const keys = dedupeKey(lead)
      if (keys.some((k) => seen.has(k))) continue
      keys.forEach((k) => seen.add(k))
      normalized.push(lead)
      if (normalized.length >= opts.maxResults) break
    }
  }

  const artifacts = writeArtifacts(opts.outDir, runId, normalized, rawPayloads)
  console.log(`✓ normalized ${normalized.length} unique leads`)
  console.log(`✓ wrote ${artifacts.jsonPath}`)
  if (opts.live) await importLeads(normalized, opts)
  return { leads: normalized, artifacts }
}

function readNormalizedInput(input?: string): NormalizedLead[] {
  if (!input) throw new Error('--input is required')
  const text = fs.readFileSync(input, 'utf8')
  if (input.endsWith('.jsonl')) return text.split(/\n/).filter(Boolean).map((line) => JSON.parse(line) as NormalizedLead)
  return JSON.parse(text) as NormalizedLead[]
}

async function importLeads(leads: NormalizedLead[], opts: CliOptions) {
  if (!opts.live) {
    console.log(`[dry-run] would import ${leads.length} leads into ${LOCAL_SERVICES_TENANT_ID}`)
    return
  }
  await seedTenant(true)
  const supabase = requireSupabase()
  const { data: stages, error: stageErr } = await supabase.from('pipeline_stages').select('id, slug').eq('tenant_id', LOCAL_SERVICES_TENANT_ID)
  if (stageErr) throw new Error(`stage lookup failed: ${stageErr.message}`)
  const stageId = stages?.find((s) => s.slug === 'ready_for_ghl')?.id ?? stages?.find((s) => s.slug === 'new')?.id ?? null

  const existing = await supabase
    .from('leads')
    .select('id, company_name, phone, company_domain, company_location, source_detail')
    .eq('tenant_id', LOCAL_SERVICES_TENANT_ID)
  if (existing.error) throw new Error(`existing lead lookup failed: ${existing.error.message}`)
  const existingKeys = new Map<string, string>()
  for (const row of existing.data ?? []) {
    const city = typeof row.company_location === 'string' ? row.company_location.split(',')[0]?.trim().toLowerCase() : ''
    const candidates = [
      row.phone ? `phone:${row.phone}` : '',
      row.company_domain ? `domain:${row.company_domain}` : '',
      row.source_detail ? `source:${row.source_detail}` : '',
      row.company_name ? `namecity:${normalizeCompanyName(row.company_name)}:${city}` : '',
    ].filter(Boolean)
    candidates.forEach((k) => existingKeys.set(k, row.id))
  }

  const newLeads: NormalizedLead[] = []
  const duplicateCount = { count: 0 }
  for (const lead of leads) {
    const sourceDetail = lead.google_place_id ? `outscraper:google_place:${lead.google_place_id}` : `outscraper:${lead.source_run_id}:${lead.source_record_id ?? normalizeCompanyName(lead.company_name)}`
    const keys = [...dedupeKey(lead), `source:${sourceDetail}`]
    if (keys.some((k) => existingKeys.has(k))) {
      duplicateCount.count += 1
      continue
    }
    newLeads.push(lead)
    keys.forEach((k) => existingKeys.set(k, 'new'))
  }

  const rows = newLeads.map((lead) => ({
    tenant_id: LOCAL_SERVICES_TENANT_ID,
    company_name: lead.company_name,
    phone: lead.phone,
    company_domain: lead.company_domain,
    company_location: lead.company_location,
    company_industry: lead.company_industry,
    source: 'api',
    source_detail: lead.google_place_id ? `outscraper:google_place:${lead.google_place_id}` : `outscraper:${lead.source_run_id}:${lead.source_record_id ?? normalizeCompanyName(lead.company_name)}`,
    score: lead.completeness_score,
    icp_fit_score: lead.completeness_score,
    engagement_score: 0,
    score_breakdown: {
      local_services: true,
      vertical_key: lead.vertical_key,
      vertical_label: lead.vertical_label,
      project_key: LOCAL_SERVICE_VERTICALS[lead.vertical_key].routeToSafeToStay ? 'safetostay_ai' : 'ask_saul_phone_agents',
      project_label: LOCAL_SERVICE_VERTICALS[lead.vertical_key].routeToSafeToStay ? 'SafeToStay.ai' : 'Ask Saul phone agents',
      hold_phone_agent_outreach: Boolean(LOCAL_SERVICE_VERTICALS[lead.vertical_key].routeToSafeToStay),
      source_provider: 'outscraper',
      source_query: lead.source_query,
      source_run_id: lead.source_run_id,
      google_place_id: lead.google_place_id,
      maps_url: lead.maps_url,
      rating: lead.rating,
      review_count: lead.review_count,
      website_url: lead.website_url,
      primary_category: lead.primary_category,
      latitude: lead.latitude,
      longitude: lead.longitude,
      phone_raw: lead.phone_raw,
      field_completeness: {
        has_phone: Boolean(lead.phone),
        has_website: Boolean(lead.company_domain),
        has_address: Boolean(lead.company_location),
        has_rating: lead.rating != null,
      },
      sendblue_ghl: {
        status: 'not_synced',
        preferred_channel: 'sms_imessage',
        requires_approval_before_send: true,
      },
    },
    red_flags: lead.phone ? [] : [{ code: 'bad_data', reason: 'missing phone; keep for enrichment, do not enroll in Sendblue outreach', flagged_at: new Date().toISOString() }],
    status: lead.phone ? 'new' : 'enriching',
    assigned_to: 'team',
    stage_id: stageId,
  }))

  let inserted = 0
  const insertedRows: Array<{ id: string; phone: string | null; company_name: string; score_breakdown: AnyRecord }> = []
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { data, error } = await supabase.from('leads').insert(batch).select('id, phone, company_name, score_breakdown')
    if (error) throw new Error(`lead insert failed at offset ${i}: ${error.message}`)
    inserted += batch.length
    insertedRows.push(...((data ?? []) as typeof insertedRows))
  }

  console.log(`✓ imported ${inserted} new leads; skipped duplicates=${duplicateCount.count}`)

  if (opts.createOutreach && insertedRows.length) {
    const { data: seq } = await supabase.from('outreach_sequences').select('id').eq('tenant_id', LOCAL_SERVICES_TENANT_ID).eq('slug', 'local-services-sendblue-control').single()
    const queueRows = insertedRows
      .filter((r) => r.phone)
      .filter((r) => !LOCAL_SERVICE_VERTICALS[(r.score_breakdown as AnyRecord).vertical_key as LocalServiceVerticalKey]?.routeToSafeToStay)
      .map((r) => {
        const sb = r.score_breakdown as AnyRecord
        const verticalKey = sb.vertical_key as LocalServiceVerticalKey
        const v = LOCAL_SERVICE_VERTICALS[verticalKey]
        const syntheticLead = leads.find((l) => l.company_name === r.company_name && l.phone === r.phone) ?? null
        const draft = syntheticLead ? renderTemplate(v.outreach.firstTouch, syntheticLead) : v.outreach.firstTouch
        return {
          tenant_id: LOCAL_SERVICES_TENANT_ID,
          lead_id: r.id,
          sequence_id: seq?.id ?? null,
          channel: 'sms',
          message_draft: draft,
          status: 'pending',
          generated_by: 'local_services_outscraper:v1',
        }
      })
    for (let i = 0; i < queueRows.length; i += BATCH_SIZE) {
      const { error } = await supabase.from('outreach_queue').insert(queueRows.slice(i, i + BATCH_SIZE))
      if (error) throw new Error(`outreach queue insert failed at offset ${i}: ${error.message}`)
    }
    console.log(`✓ queued ${queueRows.length} pending first-touch Sendblue/GHL drafts`)
  }

  if (opts.syncGhl) await syncGhlRows(newLeads, opts.live)
}

async function syncGhlRows(leads: NormalizedLead[], live: boolean) {
  const apiKey = process.env.GHL_LOCAL_SERVICES_API_KEY ?? process.env.GHL_API_KEY
  const locationId = process.env.GHL_LOCAL_SERVICES_LOCATION_ID ?? process.env.GHL_LOCATION_ID
  if (!live || !apiKey || !locationId) {
    console.log(`[dry-run] would sync ${leads.length} contacts to GHL`, { hasApiKey: Boolean(apiKey), hasLocationId: Boolean(locationId) })
    return
  }
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const supabase = requireSupabase()
  const fieldRes = await fetch(`https://services.leadconnectorhq.com/locations/${locationId}/customFields`, { headers })
  const fieldJson = (await fieldRes.json().catch(() => ({}))) as { customFields?: Array<{ id: string; name: string; fieldKey: string }> }
  const fieldsByKey = new Map((fieldJson.customFields ?? []).map((f) => [f.fieldKey, f]))
  const makeCustomFields = (lead: NormalizedLead) => {
    const values: Record<string, string | null> = {
      'contact.local_services_vertical': lead.vertical_label,
      'contact.outscraper_source_query': lead.source_query,
      'contact.google_place_id': lead.google_place_id,
      'contact.google_maps_url': lead.maps_url,
      'contact.google_rating': lead.rating != null ? `${lead.rating} (${lead.review_count ?? 0} reviews)` : null,
      'contact.lead_source_run_id': lead.source_run_id,
      'contact.sendblue_eligibility': 'unknown',
      'contact.first_touch_variant': `${lead.vertical_key}_first_touch_control`,
      'contact.outreach_approved': 'false',
      'contact.demo_phone_agent_number': process.env.LOCAL_SERVICES_DEMO_NUMBER ?? null,
      'contact.pay_per_close_terms': 'Free setup, no contract, $50 only if a job closes from one of the calls',
      'contact.ai_phone_agent_offer': renderTemplate(LOCAL_SERVICE_VERTICALS[lead.vertical_key].outreach.yesReply, lead),
      'contact.a2ptcpa_notes': 'Cold outreach requires approval, business-hours pacing, and immediate opt-out suppression.',
    }
    return Object.entries(values)
      .filter(([, value]) => value)
      .map(([key, value]) => {
        const field = fieldsByKey.get(key)
        return field ? { id: field.id, key, field_value: value } : null
      })
      .filter(Boolean)
  }

  let synced = 0
  let backfilled = 0
  for (const lead of leads.filter((l) => l.phone)) {
    const payload = {
      locationId,
      firstName: lead.company_name,
      lastName: 'Local Lead',
      phone: lead.phone,
      companyName: lead.company_name,
      website: lead.website_url ?? undefined,
      source: 'Outscraper Google Maps',
      tags: [
        'local-services',
        LOCAL_SERVICE_VERTICALS[lead.vertical_key].ghlTag,
        'source-outscraper',
        LOCAL_SERVICE_VERTICALS[lead.vertical_key].routeToSafeToStay ? 'project-safetostay-ai' : 'project-ask-saul-phone-agents',
        LOCAL_SERVICE_VERTICALS[lead.vertical_key].routeToSafeToStay ? 'hold-phone-agent-outreach' : 'ready-review',
      ],
    }
    const res = await fetch('https://services.leadconnectorhq.com/contacts/upsert', { method: 'POST', headers, body: JSON.stringify(payload) })
    const data = (await res.json().catch(() => ({}))) as AnyRecord
    if (!res.ok) {
      console.warn(`GHL sync failed for ${lead.company_name}: ${res.status} ${JSON.stringify(data).slice(0, 200)}`)
      continue
    }
    const contactId =
      ((data.contact as AnyRecord | undefined)?.id as string | undefined) ||
      (data.id as string | undefined) ||
      ((data.contacts as Array<AnyRecord> | undefined)?.[0]?.id as string | undefined)
    if (contactId) {
      const customFields = makeCustomFields(lead)
      if (customFields.length) {
        await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ customFields }),
        })
      }
      const { error } = await supabase
        .from('leads')
        .update({ ghl_contact_id: contactId, ghl_last_sync: new Date().toISOString() })
        .eq('tenant_id', LOCAL_SERVICES_TENANT_ID)
        .eq('phone', lead.phone)
      if (!error) backfilled += 1
    }
    synced += 1
    await new Promise((r) => setTimeout(r, 125))
  }
  console.log(`✓ synced ${synced}/${leads.filter((l) => l.phone).length} contacts to GHL; backfilled dashboard ghl_contact_id=${backfilled}`)
}

async function main() {
  const opts = parseArgs(process.argv)
  if (opts.action === 'seed') return seedTenant(opts.live)
  if (opts.action === 'search') return search(opts)
  if (opts.action === 'import-file') return importLeads(readNormalizedInput(opts.input), opts)
  if (opts.action === 'sync-ghl') return syncGhlRows(readNormalizedInput(opts.input), opts.live)
  usage()
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
