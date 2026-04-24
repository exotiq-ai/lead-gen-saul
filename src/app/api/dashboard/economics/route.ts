import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { calculateCost } from '@/lib/utils/costs'
import { parseQuery } from '@/lib/validation/parse'
import { economicsQuerySchema } from '@/lib/validation/schemas'

export const runtime = 'nodejs'

function seededRandom(seed: number): number {
  const x = Math.sin(seed + 42.7) * 10000
  return x - Math.floor(x)
}

type TokenDay = { date: string; input_tokens: number; output_tokens: number; cost_cents: number }
type EnrichmentProvider = { provider: string; total_cost_cents: number; record_count: number; avg_cost_cents: number }
type AgentCost = { agent_type: string; runs: number; total_cost_cents: number; avg_tokens: number }

function generateDemoTokenData(): TokenDay[] {
  const base = new Date('2026-04-23')
  return Array.from({ length: 30 }, (_, i) => {
    const dayOffset = 29 - i
    const d = new Date(base)
    d.setDate(d.getDate() - dayOffset)
    const date = d.toISOString().split('T')[0]
    const r1 = seededRandom(dayOffset * 3)
    const r2 = seededRandom(dayOffset * 3 + 1)
    const dayOfMonth = d.getDate()
    const spikeMultiplier = [10, 11, 18].includes(dayOfMonth) ? 1.9 : 1.0
    const input_tokens = Math.round((45000 + r1 * 75000) * spikeMultiplier)
    const output_tokens = Math.round((8000 + r2 * 17000) * spikeMultiplier)
    const cost_cents = calculateCost('claude-sonnet-4-20250514', input_tokens, output_tokens)
    return { date, input_tokens, output_tokens, cost_cents }
  })
}

export async function GET(req: NextRequest) {
  const parsed = parseQuery(economicsQuerySchema, req.nextUrl)
  if (!parsed.success) return parsed.response
  const { tenant_id: tenantId } = parsed.data

  const supabase = createServerClient()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: tokenRows, error: tokenError },
    { data: enrichmentRows },
    { data: agentRunRows },
    { data: leads },
  ] = await Promise.all([
    supabase
      .from('token_usage')
      .select('created_at, input_tokens, output_tokens, cost_cents')
      .eq('tenant_id', tenantId)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: true }),
    supabase
      .from('enrichments')
      .select('provider, cost_cents, requested_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'completed'),
    supabase
      .from('agent_runs')
      .select('agent_type, cost_cents, tokens_used')
      .eq('tenant_id', tenantId)
      .eq('status', 'completed'),
    supabase
      .from('leads')
      .select('status')
      .eq('tenant_id', tenantId),
  ])

  const useDemoTokens = !!tokenError || !tokenRows || tokenRows.length < 5
  const useDemoEnrichment = !enrichmentRows || enrichmentRows.length === 0
  const useDemoAgents = !agentRunRows || agentRunRows.length === 0
  const useDemoLeads = !leads || leads.length < 5

  // ── Token daily ──────────────────────────────────────────────────────────
  let token_daily: TokenDay[]

  if (useDemoTokens) {
    token_daily = generateDemoTokenData()
  } else {
    const grouped: Record<string, { input_tokens: number; output_tokens: number; cost_cents: number }> = {}
    for (const row of tokenRows!) {
      const date = String(row.created_at ?? '').split('T')[0]
      if (!date) continue
      if (!grouped[date]) grouped[date] = { input_tokens: 0, output_tokens: 0, cost_cents: 0 }
      grouped[date].input_tokens += (row.input_tokens as number) ?? 0
      grouped[date].output_tokens += (row.output_tokens as number) ?? 0
      grouped[date].cost_cents += (row.cost_cents as number) ?? 0
    }
    token_daily = Object.entries(grouped)
      .map(([date, vals]) => ({ date, ...vals }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  const token_total_cents = token_daily.reduce((s, d) => s + d.cost_cents, 0)
  const token_monthly_cents = token_daily
    .filter(d => d.date >= monthStart)
    .reduce((s, d) => s + d.cost_cents, 0)

  // ── Enrichment costs ──────────────────────────────────────────────────────
  let enrichment_by_provider: EnrichmentProvider[]
  let enrichment_total_cents: number
  let enrichment_monthly_cents: number

  if (!useDemoEnrichment) {
    const byProvider: Record<string, { total: number; count: number }> = {}
    for (const row of enrichmentRows!) {
      const p = String(row.provider ?? 'unknown')
      if (!byProvider[p]) byProvider[p] = { total: 0, count: 0 }
      const cost = (row.cost_cents as number) ?? 0
      byProvider[p].total += cost
      byProvider[p].count++
    }
    enrichment_by_provider = Object.entries(byProvider)
      .map(([provider, { total, count }]) => ({
        provider,
        total_cost_cents: total,
        record_count: count,
        avg_cost_cents: count > 0 ? Math.round(total / count) : 0,
      }))
      .sort((a, b) => b.total_cost_cents - a.total_cost_cents)
    enrichment_total_cents = enrichmentRows!.reduce((s, r) => s + ((r.cost_cents as number) ?? 0), 0)
    enrichment_monthly_cents = enrichmentRows!
      .filter(r => String(r.requested_at ?? '').split('T')[0] >= monthStart)
      .reduce((s, r) => s + ((r.cost_cents as number) ?? 0), 0)
  } else {
    enrichment_total_cents = 82200
    enrichment_monthly_cents = 29400
    enrichment_by_provider = [
      { provider: 'apollo',   total_cost_cents: 49320, record_count: 302, avg_cost_cents: 163 },
      { provider: 'saul_web', total_cost_cents: 24660, record_count: 151, avg_cost_cents: 163 },
      { provider: 'clearbit', total_cost_cents: 5560,  record_count:  24, avg_cost_cents: 232 },
      { provider: 'manual',   total_cost_cents: 2660,  record_count:   8, avg_cost_cents: 333 },
    ]
  }

  // ── Agent costs ──────────────────────────────────────────────────────────
  let agent_costs: AgentCost[]

  if (!useDemoAgents) {
    const byType: Record<string, { runs: number; total: number; totalTokens: number }> = {}
    for (const row of agentRunRows!) {
      const t = String(row.agent_type ?? 'unknown')
      if (!byType[t]) byType[t] = { runs: 0, total: 0, totalTokens: 0 }
      byType[t].runs++
      byType[t].total += (row.cost_cents as number) ?? 0
      byType[t].totalTokens += (row.tokens_used as number) ?? 0
    }
    agent_costs = Object.entries(byType)
      .map(([agent_type, { runs, total, totalTokens }]) => ({
        agent_type,
        runs,
        total_cost_cents: total,
        avg_tokens: runs > 0 ? Math.round(totalTokens / runs) : 0,
      }))
      .sort((a, b) => b.total_cost_cents - a.total_cost_cents)
  } else {
    agent_costs = [
      { agent_type: 'enrichment',   runs: 847, total_cost_cents: 594, avg_tokens: 4200 },
      { agent_type: 'orchestrator', runs: 423, total_cost_cents: 327, avg_tokens: 2800 },
      { agent_type: 'scoring',      runs: 623, total_cost_cents: 267, avg_tokens: 3100 },
      { agent_type: 'sourcing',     runs: 312, total_cost_cents: 163, avg_tokens: 5600 },
      { agent_type: 'outreach',     runs: 201, total_cost_cents:  89, avg_tokens: 2200 },
      { agent_type: 'qualifier',    runs: 156, total_cost_cents:  45, avg_tokens: 1900 },
    ]
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const isFullDemo = useDemoTokens && useDemoEnrichment && useDemoAgents

  const total_spend_cents = isFullDemo ? 84700 : enrichment_total_cents + token_total_cents
  const monthly_spend_cents = isFullDemo ? 31200 : enrichment_monthly_cents + token_monthly_cents
  const enrichment_spend_cents = isFullDemo ? 84700 : enrichment_total_cents

  const totalLeads = useDemoLeads ? 500 : Math.max(leads!.length, 1)
  const qualifiedLeads = useDemoLeads
    ? 60
    : Math.max(leads!.filter(l => ['qualified', 'converted'].includes(String(l.status ?? ''))).length, 1)
  const conversions = useDemoLeads
    ? 31
    : Math.max(leads!.filter(l => l.status === 'converted').length, 1)

  const cost_per_lead_cents = Math.round(total_spend_cents / totalLeads)
  const cost_per_qualified_cents = Math.round(total_spend_cents / qualifiedLeads)
  const cost_per_conversion_cents = Math.round(total_spend_cents / conversions)

  const monthly_budget_cents = 500_000
  const budget_used_pct = Math.round((monthly_spend_cents / monthly_budget_cents) * 1000) / 10

  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const projected_month_end_cents =
    dayOfMonth > 0 ? Math.round(monthly_spend_cents * (daysInMonth / dayOfMonth)) : monthly_spend_cents

  return NextResponse.json({
    total_spend_cents,
    monthly_spend_cents,
    cost_per_lead_cents,
    cost_per_qualified_cents,
    cost_per_conversion_cents,
    enrichment_spend_cents,
    monthly_budget_cents,
    budget_used_pct,
    projected_month_end_cents,
    token_daily,
    enrichment_by_provider,
    agent_costs,
    is_demo: isFullDemo,
  })
}
