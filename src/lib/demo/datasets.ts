export const DEMO_KPIS = {
  total_active: 847,
  total_active_trend: 12.4,
  velocity_per_week: 42,
  velocity_trend: 8.2,
  avg_score: 76,
  avg_score_trend: 3.1,
  conversion_rate: 18.4,
  conversion_trend: 2.8,
  sparklines: {
    active: [780, 795, 810, 820, 830, 838, 847],
    velocity: [35, 38, 36, 40, 39, 41, 42],
    score: [72, 73, 74, 75, 75, 76, 76],
    conversion: [15.2, 15.8, 16.1, 16.9, 17.4, 17.8, 18.4],
  },
}

export const DEMO_PIPELINE = {
  stages: [
    { id: 'new', name: 'New', count: 312, avgScore: 42, position: 0 },
    { id: 'contacted', name: 'Contacted', count: 218, avgScore: 56, position: 1 },
    { id: 'engaged', name: 'Engaged', count: 156, avgScore: 68, position: 2 },
    { id: 'qualified', name: 'Qualified', count: 89, avgScore: 78, position: 3 },
    { id: 'converted', name: 'Converted', count: 72, avgScore: 91, position: 4 },
  ],
}

export const DEMO_LEADS = {
  leads: [
    { id: '1', company_name: 'Prestige Exotics Miami', contact_name: 'Carlos Mendez', email: 'carlos@prestigeexotics.com', score: 92, status: 'qualified', source: 'apollo', created_at: '2026-04-28T14:22:00Z' },
    { id: '2', company_name: 'LuxDrive Beverly Hills', contact_name: 'Samantha Cole', email: 'sam@luxdrivebh.com', score: 88, status: 'engaged', source: 'web_scrape', created_at: '2026-04-27T09:15:00Z' },
    { id: '3', company_name: 'Veloce Rentals Dubai', contact_name: 'Rashid Al-Mansour', email: 'rashid@velocerentals.ae', score: 85, status: 'contacted', source: 'apollo', created_at: '2026-04-26T11:30:00Z' },
    { id: '4', company_name: 'Supercar Hire London', contact_name: 'James Whitmore', email: 'james@supercarhire.co.uk', score: 83, status: 'qualified', source: 'apollo', created_at: '2026-04-25T16:45:00Z' },
    { id: '5', company_name: 'Elite Auto Monaco', contact_name: 'Pierre Duval', email: 'pierre@eliteautomonaco.mc', score: 81, status: 'engaged', source: 'web_scrape', created_at: '2026-04-24T08:00:00Z' },
    { id: '6', company_name: 'Apex Exotic Rentals Scottsdale', contact_name: 'Derek Lawson', email: 'derek@apexexotics.com', score: 79, status: 'contacted', source: 'apollo', created_at: '2026-04-23T13:20:00Z' },
    { id: '7', company_name: 'Cavallo Luxury Cars Toronto', contact_name: 'Natalie Park', email: 'natalie@cavallolux.ca', score: 77, status: 'new', source: 'manual', created_at: '2026-04-22T10:10:00Z' },
    { id: '8', company_name: 'Maranello Motors Dallas', contact_name: 'Austin Briggs', email: 'austin@maranellomotors.com', score: 75, status: 'qualified', source: 'web_scrape', created_at: '2026-04-21T15:30:00Z' },
    { id: '9', company_name: 'V12 Concierge Las Vegas', contact_name: 'Rachel Torres', email: 'rachel@v12concierge.com', score: 73, status: 'engaged', source: 'apollo', created_at: '2026-04-20T12:45:00Z' },
    { id: '10', company_name: 'Prime GT Sydney', contact_name: 'Liam O\'Connor', email: 'liam@primegt.com.au', score: 71, status: 'contacted', source: 'web_scrape', created_at: '2026-04-19T07:15:00Z' },
    { id: '11', company_name: 'Regal Exotics Atlanta', contact_name: 'Marcus Hill', email: 'marcus@regalexotics.com', score: 68, status: 'new', source: 'apollo', created_at: '2026-04-18T14:00:00Z' },
    { id: '12', company_name: 'Turbo Rentals Palm Beach', contact_name: 'Jessica Hartman', email: 'jessica@turborentals.com', score: 65, status: 'contacted', source: 'manual', created_at: '2026-04-17T09:30:00Z' },
    { id: '13', company_name: 'Autobahn Elite Munich', contact_name: 'Hans Richter', email: 'hans@autobahnelite.de', score: 62, status: 'new', source: 'apollo', created_at: '2026-04-16T11:20:00Z' },
    { id: '14', company_name: 'Platinum Wheels Chicago', contact_name: 'Jordan Blake', email: 'jordan@platinumwheels.com', score: 58, status: 'new', source: 'web_scrape', created_at: '2026-04-15T16:00:00Z' },
    { id: '15', company_name: 'Grand Prix Rentals Singapore', contact_name: 'Wei Lin', email: 'weilin@grandprixrentals.sg', score: 55, status: 'new', source: 'apollo', created_at: '2026-04-14T08:45:00Z' },
  ],
  total: 847,
  page: 1,
  limit: 50,
}

export const DEMO_VOLUME = {
  data: [
    { date: '2026-03-28', count: 5 },
    { date: '2026-03-29', count: 7 },
    { date: '2026-03-30', count: 4 },
    { date: '2026-03-31', count: 8 },
    { date: '2026-04-01', count: 6 },
    { date: '2026-04-02', count: 9 },
    { date: '2026-04-03', count: 5 },
    { date: '2026-04-04', count: 7 },
    { date: '2026-04-05', count: 11 },
    { date: '2026-04-06', count: 4 },
    { date: '2026-04-07', count: 6 },
    { date: '2026-04-08', count: 8 },
    { date: '2026-04-09', count: 10 },
    { date: '2026-04-10', count: 7 },
    { date: '2026-04-11', count: 5 },
    { date: '2026-04-12', count: 9 },
    { date: '2026-04-13', count: 6 },
    { date: '2026-04-14', count: 8 },
    { date: '2026-04-15', count: 12 },
    { date: '2026-04-16', count: 7 },
    { date: '2026-04-17', count: 5 },
    { date: '2026-04-18', count: 8 },
    { date: '2026-04-19', count: 6 },
    { date: '2026-04-20', count: 9 },
    { date: '2026-04-21', count: 7 },
    { date: '2026-04-22', count: 11 },
    { date: '2026-04-23', count: 8 },
    { date: '2026-04-24', count: 6 },
    { date: '2026-04-25', count: 10 },
    { date: '2026-04-26', count: 7 },
  ],
}

export const DEMO_SOURCES = {
  data: [
    { source: 'Apollo.io', count: 412, pct: 48.6 },
    { source: 'Web Scrape', count: 228, pct: 26.9 },
    { source: 'Manual', count: 112, pct: 13.2 },
    { source: 'Referral', count: 62, pct: 7.3 },
    { source: 'Inbound', count: 33, pct: 3.9 },
  ],
}

export const DEMO_AGING = {
  data: [
    { bucket: '0-3 days', count: 156 },
    { bucket: '4-7 days', count: 198 },
    { bucket: '8-14 days', count: 224 },
    { bucket: '15-30 days', count: 168 },
    { bucket: '30+ days', count: 101 },
  ],
}

export const DEMO_SCORES = {
  leads: Array.from({ length: 100 }, (_, i) => ({
    id: `score-${i}`,
    score: Math.round(30 + Math.random() * 65),
  })),
  avg_score: 76,
}

export const DEMO_OUTREACH = {
  queue: [
    { id: 'oq-1', lead_name: 'Carlos Mendez', company: 'Prestige Exotics Miami', status: 'pending', channel: 'email', created_at: '2026-04-28T14:22:00Z' },
    { id: 'oq-2', lead_name: 'Samantha Cole', company: 'LuxDrive Beverly Hills', status: 'sent', channel: 'email', created_at: '2026-04-27T09:15:00Z' },
    { id: 'oq-3', lead_name: 'Rashid Al-Mansour', company: 'Veloce Rentals Dubai', status: 'approved', channel: 'email', created_at: '2026-04-26T11:30:00Z' },
    { id: 'oq-4', lead_name: 'James Whitmore', company: 'Supercar Hire London', status: 'sent', channel: 'email', created_at: '2026-04-25T16:45:00Z' },
    { id: 'oq-5', lead_name: 'Pierre Duval', company: 'Elite Auto Monaco', status: 'pending', channel: 'linkedin', created_at: '2026-04-24T08:00:00Z' },
  ],
  pending_count: 8,
  total_sent: 342,
}

export const DEMO_AGENTS = {
  agents: [
    { agent_type: 'enrichment', status: 'idle', last_run: '2026-04-28T13:45:00Z', runs_24h: 24, success_rate: 97.2, avg_duration_ms: 3400 },
    { agent_type: 'scoring', status: 'running', last_run: '2026-04-28T14:10:00Z', runs_24h: 38, success_rate: 99.1, avg_duration_ms: 1200 },
    { agent_type: 'outreach', status: 'idle', last_run: '2026-04-28T12:30:00Z', runs_24h: 12, success_rate: 95.8, avg_duration_ms: 4800 },
    { agent_type: 'orchestrator', status: 'idle', last_run: '2026-04-28T14:00:00Z', runs_24h: 18, success_rate: 98.4, avg_duration_ms: 2100 },
  ],
  total_runs_7d: 847,
  uptime_pct: 99.2,
}

export const DEMO_ECONOMICS = {
  total_spend_cents: 28000,
  monthly_spend_cents: 12400,
  cost_per_lead_cents: 33,
  cost_per_qualified_cents: 180,
  cost_per_conversion_cents: 1167,
  enrichment_spend_cents: 18200,
  monthly_budget_cents: 500000,
  budget_used_pct: 2.48,
  projected_month_end_cents: 16800,
  token_daily: Array.from({ length: 30 }, (_, i) => {
    const d = new Date('2026-04-28')
    d.setDate(d.getDate() - (29 - i))
    const date = d.toISOString().split('T')[0]
    const base = 40000 + Math.sin(i * 0.5) * 15000
    const input_tokens = Math.round(base + Math.random() * 10000)
    const output_tokens = Math.round(input_tokens * 0.22)
    const cost_cents = Math.round((input_tokens * 0.003 + output_tokens * 0.015) / 10)
    return { date, input_tokens, output_tokens, cost_cents }
  }),
  enrichment_by_provider: [
    { provider: 'apollo', total_cost_cents: 10920, record_count: 302, avg_cost_cents: 36 },
    { provider: 'saul_web', total_cost_cents: 5460, record_count: 151, avg_cost_cents: 36 },
    { provider: 'clearbit', total_cost_cents: 1320, record_count: 24, avg_cost_cents: 55 },
    { provider: 'manual', total_cost_cents: 500, record_count: 8, avg_cost_cents: 63 },
  ],
  agent_costs: [
    { agent_type: 'enrichment', runs: 847, total_cost_cents: 594, avg_tokens: 4200 },
    { agent_type: 'orchestrator', runs: 423, total_cost_cents: 327, avg_tokens: 2800 },
    { agent_type: 'scoring', runs: 623, total_cost_cents: 267, avg_tokens: 3100 },
    { agent_type: 'sourcing', runs: 312, total_cost_cents: 163, avg_tokens: 5600 },
    { agent_type: 'outreach', runs: 201, total_cost_cents: 89, avg_tokens: 2200 },
    { agent_type: 'qualifier', runs: 156, total_cost_cents: 45, avg_tokens: 1900 },
  ],
  is_demo: true,
}

export const DEMO_BRIEF = {
  tenant_name: 'Exotiq.ai',
  industry: 'Exotic Car Rentals',
  target_market: 'Luxury vehicle rental companies worldwide',
  active_campaigns: 3,
  total_outreach_sent: 342,
  meetings_booked: 12,
}

export const DEMO_ROI = {
  meetings_booked: 12,
  meetings_trend: 20.0,
  time_saved_hours: 156,
  outreach_sent: 342,
  outreach_replied: 48,
  reply_rate: 14.0,
  lead_velocity_week: 42,
  leads_qualified: 89,
  leads_converted: 24,
  conversion_rate: 18.4,
  cost_per_lead_cents: 33,
  cost_per_qualified_cents: 180,
  total_spend_cents: 28000,
  roi_multiple: 4.2,
  pipeline_value_estimate: 125000,
  funnel: [
    { stage: 'Discovered', count: 847 },
    { stage: 'Enriched', count: 620 },
    { stage: 'Scored', count: 520 },
    { stage: 'Outreach Sent', count: 342 },
    { stage: 'Engaged', count: 89 },
    { stage: 'Converted', count: 24 },
  ],
  agent_uptime_pct: 99.2,
  avg_response_time_hours: 2.4,
}

export const DEMO_RED_FLAGS = {
  count: 3,
}

const DEMO_DATA_MAP: Record<string, unknown> = {
  '/api/dashboard/kpis': DEMO_KPIS,
  '/api/dashboard/pipeline': DEMO_PIPELINE,
  '/api/dashboard/volume': DEMO_VOLUME,
  '/api/dashboard/sources': DEMO_SOURCES,
  '/api/dashboard/scores': DEMO_SCORES,
  '/api/dashboard/aging': DEMO_AGING,
  '/api/dashboard/economics': DEMO_ECONOMICS,
  '/api/dashboard/agents': DEMO_AGENTS,
  '/api/dashboard/roi': DEMO_ROI,
  '/api/dashboard/red-flags': DEMO_RED_FLAGS,
  '/api/outreach/queue': DEMO_OUTREACH,
  '/api/leads': DEMO_LEADS,
}

export function getDemoDataForPath(url: string): unknown | null {
  const pathname = url.split('?')[0]
  return DEMO_DATA_MAP[pathname] ?? null
}
