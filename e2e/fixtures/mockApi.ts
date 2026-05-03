import type { Page, Route } from '@playwright/test'

/**
 * Mock the API surface the dashboard uses, keyed by URL path. Each
 * test installs this once via attachMocks(page) and may override
 * specific endpoints with overrideJson(page, path, body).
 *
 * The shapes here mirror what the real /api/* routes return today.
 */

const TENANT_EXOTIQ = '00000000-0000-0000-0000-000000000001'

const mockLead = {
  id: '11111111-2222-3333-4444-555555555555',
  first_name: 'Casey',
  last_name: 'Mock',
  company_name: 'Mock Exotic Rentals',
  company_location: 'Miami, FL',
  company_industry: 'exotic_rental',
  company_size: null,
  source: 'outbound',
  score: 82,
  score_breakdown: {
    fleet_size: 12,
    composite: 82,
  },
  icp_fit_score: 80,
  engagement_score: 60,
  red_flags: [],
  status: 'scored',
  assigned_to: 'gregory',
  stage_id: null,
  created_at: '2026-04-01T00:00:00Z',
  last_activity_at: '2026-04-25T00:00:00Z',
}

const mockOutreachItem = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  tenant_id: TENANT_EXOTIQ,
  lead_id: mockLead.id,
  sequence_id: null,
  channel: 'instagram_dm',
  message_draft: 'Hey Casey, Gregory here from Exotiq.\n\nMock draft for Playwright.',
  status: 'pending',
  generated_by: 'saul_agent:tier1_proof',
  reviewed_by: null,
  approved_at: null,
  sent_at: null,
  rejection_reason: null,
  created_at: '2026-04-25T01:00:00Z',
  updated_at: '2026-04-25T01:00:00Z',
  leads: {
    company_name: mockLead.company_name,
    score: mockLead.score,
    first_name: mockLead.first_name,
    last_name: mockLead.last_name,
    company_location: mockLead.company_location,
    assigned_to: mockLead.assigned_to,
  },
}

const STATIC_RESPONSES: Record<string, unknown> = {
  '/api/dashboard/kpis': {
    total_active: 3,
    total_active_trend: 0,
    velocity_per_week: 1,
    velocity_trend: 0,
    avg_score: 80,
    avg_score_trend: 0,
    conversion_rate: 25,
    conversion_trend: 0,
    sparklines: { active: [3,3,3,3,3,3,3], velocity: [0,0,0,0,1,0,0], score: [80,80,80,80,80,80,80], conversion: [25,25,25,25,25,25,25] },
  },
  '/api/dashboard/pipeline': {
    stages: [
      { id: 'stage-new', name: 'New', count: 1, avgScore: 50, position: 0 },
      { id: 'stage-scored', name: 'Scored', count: 1, avgScore: 82, position: 1 },
      { id: 'stage-engaged', name: 'Engaged', count: 1, avgScore: 90, position: 2 },
    ],
  },
  '/api/dashboard/aging': { data: [
    { bucket: 'active', count: 1 },
    { bucket: 'cooling', count: 0 },
    { bucket: 'stale', count: 0 },
    { bucket: 'dead', count: 0 },
  ] },
  '/api/dashboard/sources': { data: [{ source: 'Apollo Outbound', total: 3, converted: 1, conversion_rate: 33.3, avg_score: 80 }] },
  '/api/dashboard/red-flags': { count: 0 },
  '/api/dashboard/scores': { leads: [{ score: 82 }, { score: 70 }, { score: 50 }] },
  '/api/dashboard/volume': { data: [{ date: '2026-04-25', inbound: 0, outbound: 1 }] },
  '/api/dashboard/activity': { activities: [] },
  '/api/dashboard/agents': {
    gateway: {
      status: 'online',
      protocol: 'OpenClaw WebSocket (Gateway)',
      last_heartbeat: new Date().toISOString(),
      model: 'mock-model',
    },
    cron: { interval_minutes: 15, next_run_at: new Date(Date.now() + 60_000).toISOString() },
    agent_cards: [
      { agent_type: 'orchestrator', status: 'idle', last_run_at: null, duration_ms: null, success_rate: 100, tokens_total: 0, runs: 1 },
    ],
    recent_runs: [],
  },
  '/api/dashboard/economics': {
    total_spend_cents: 100, monthly_spend_cents: 50, cost_per_lead_cents: 33,
    cost_per_qualified_cents: 100, cost_per_conversion_cents: 100,
    enrichment_spend_cents: 60, monthly_budget_cents: 100000, budget_used_pct: 0.05,
    projected_month_end_cents: 60,
    token_daily: [], enrichment_by_provider: [], agent_costs: [], is_demo: false,
  },
  '/api/tenants': { tenants: [{ id: TENANT_EXOTIQ, name: 'Exotiq.ai', slug: 'exotiq', icon: '🏎️' }] },
  '/api/leads': {
    data: [mockLead],
    meta: {
      total: 1, page: 1, limit: 50, totalPages: 1, offset: 0, has_more: false,
      red_flag_count: 0, gregory_count: 1, converted_this_month: 0,
    },
    leads: [mockLead], total: 1, page: 1, limit: 50, has_more: false,
  },
  '/api/outreach/queue': { items: [mockOutreachItem], pending_count: 1 },
}

export async function attachMocks(page: Page) {
  // Mock all /api/* fetches the dashboard makes during a pipeline walk.
  await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url())
    const path = url.pathname

    // Approve / reject / mark_sent flow goes through PATCH on per-id route.
    if (route.request().method() === 'PATCH' && path.startsWith('/api/outreach/queue/')) {
      const body = JSON.parse(route.request().postData() || '{}') as { action?: string }
      const status =
        body.action === 'approve' ? 'approved' :
        body.action === 'reject'  ? 'rejected' :
        body.action === 'mark_sent' ? 'sent' :
        'pending'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ item: { ...mockOutreachItem, status } }),
      })
      return
    }

    if (route.request().method() === 'PATCH' && path === '/api/outreach/queue/bulk') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ requested: 1, affected: 1, items: [{ id: mockOutreachItem.id, status: 'approved' }] }),
      })
      return
    }

    // Match the path with optional query string stripped.
    if (STATIC_RESPONSES[path]) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(STATIC_RESPONSES[path]),
      })
      return
    }

    // Fallback: 200 empty so unmocked endpoints don't blow up the run.
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    })
  })
}

export const fixtures = { mockLead, mockOutreachItem, TENANT_EXOTIQ }
