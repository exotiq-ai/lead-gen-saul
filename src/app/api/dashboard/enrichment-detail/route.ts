import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseQuery } from '@/lib/validation/parse'
import { enrichmentDetailQuerySchema } from '@/lib/validation/schemas'

export const runtime = 'nodejs'

type EnrichmentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'

interface EnrichmentRow {
  id: string
  lead_id: string
  provider: string
  status: EnrichmentStatus
  cost_cents: number
  requested_at: string
  completed_at: string | null
  error_message: string | null
  // Supabase returns FK joins as arrays; we take the first element
  leads: Array<{ company_name: string | null }> | null
}

export async function GET(req: NextRequest) {
  const parsed = parseQuery(enrichmentDetailQuerySchema, req.nextUrl)
  if (!parsed.success) return parsed.response
  const { tenant_id: tenantId } = parsed.data

  try {
    const supabase = createServerClient()

    // All enrichments for this tenant
    const { data: allEnrichments, error: enrichErr } = await supabase
      .from('enrichments')
      .select('id, lead_id, provider, status, cost_cents, requested_at, completed_at, error_message')
      .eq('tenant_id', tenantId)

    if (enrichErr) throw enrichErr

    const enrichments = (allEnrichments ?? []) as Omit<EnrichmentRow, 'leads'>[]

    // Status counts
    const statusCounts: Record<EnrichmentStatus, number> = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
    }
    for (const e of enrichments) {
      if (e.status in statusCounts) {
        statusCounts[e.status as EnrichmentStatus]++
      }
    }

    // Total cost
    const total_cost_cents = enrichments.reduce((s, e) => s + (e.cost_cents ?? 0), 0)

    // By provider aggregation
    const providerMap = new Map<
      string,
      { count: number; completed: number; failed: number; total_cost_cents: number }
    >()
    for (const e of enrichments) {
      if (!providerMap.has(e.provider)) {
        providerMap.set(e.provider, { count: 0, completed: 0, failed: 0, total_cost_cents: 0 })
      }
      const p = providerMap.get(e.provider)!
      p.count++
      p.total_cost_cents += e.cost_cents ?? 0
      if (e.status === 'completed') p.completed++
      if (e.status === 'failed') p.failed++
    }
    const by_provider = Array.from(providerMap.entries()).map(([provider, stats]) => ({
      provider,
      count: stats.count,
      completed: stats.completed,
      failed: stats.failed,
      total_cost_cents: stats.total_cost_cents,
      avg_cost_cents: stats.count > 0 ? Math.round(stats.total_cost_cents / stats.count) : 0,
      success_rate:
        stats.count > 0 ? Math.round((stats.completed / stats.count) * 1000) / 10 : 0,
    }))

    // Coverage: distinct lead_ids with at least one completed enrichment vs total leads
    const { count: totalLeads } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)

    const completedLeadIds = new Set(
      enrichments.filter((e) => e.status === 'completed').map((e) => e.lead_id),
    )
    const enrichedLeadsCount = completedLeadIds.size
    const enrichment_coverage_pct =
      (totalLeads ?? 0) > 0
        ? Math.round((enrichedLeadsCount / (totalLeads as number)) * 1000) / 10
        : 0

    // Recent 10 enrichments with company name
    const { data: recentRaw } = await supabase
      .from('enrichments')
      .select('id, lead_id, provider, status, cost_cents, requested_at, leads(company_name)')
      .eq('tenant_id', tenantId)
      .order('requested_at', { ascending: false })
      .limit(10)

    const recent = ((recentRaw ?? []) as unknown as EnrichmentRow[]).map((e) => ({
      id: e.id,
      company_name: e.leads?.[0]?.company_name ?? 'Unknown Company',
      provider: e.provider,
      status: e.status,
      cost_cents: e.cost_cents ?? 0,
      created_at: e.requested_at,
    }))

    return NextResponse.json({
      status_counts: statusCounts,
      enrichment_coverage_pct,
      total_cost_cents,
      by_provider,
      recent,
    })
  } catch (err) {
    console.error('[enrichment-detail]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
