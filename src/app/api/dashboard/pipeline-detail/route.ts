import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const DEMO_TENANT = '00000000-0000-0000-0000-000000000001'

// ─── Exported Types ──────────────────────────────────────────────────────────

export interface PipelineTopLead {
  id: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
  city: string | null
  state: string | null
  score: number | null
  assigned_to: string | null
  red_flags: unknown
  last_activity_at: string | null
}

export interface PipelineStageDetail {
  id: string
  name: string
  slug: string | null
  position: number
  color: string | null
  is_terminal: boolean
  terminal_type: string | null
  lead_count: number
  avg_score: number | null
  gregory_count: number
  high_score_count: number
  flagged_count: number
  active_this_week: number
  top_leads: PipelineTopLead[]
}

export interface PipelineDetailResponse {
  stages: PipelineStageDetail[]
  total_leads: number
  total_converted: number
  conversion_rate: number
  added_this_week: number
  total_gregory: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function redFlagged(flags: unknown): boolean {
  if (!flags) return false
  if (Array.isArray(flags)) return flags.length > 0
  if (typeof flags === 'string') return flags !== '[]' && flags.length > 2
  return false
}

function isWonStage(stage: {
  is_terminal: boolean
  terminal_type: string | null
  slug: string | null
  name: string
}): boolean {
  if (!stage.is_terminal) return false
  if (stage.terminal_type === 'won') return true
  const slug = stage.slug ?? ''
  const name = stage.name.toLowerCase()
  return slug.includes('convert') || name.includes('convert') || name.includes('won')
}

// ─── Core data fetcher (shared with server component) ────────────────────────

export async function fetchPipelineDetail(tenantId: string): Promise<PipelineDetailResponse> {
  const supabase = createServerClient()
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Fetch pipeline stages
  const { data: rawStages } = await supabase
    .from('pipeline_stages')
    .select('id, name, slug, position, color, is_terminal, terminal_type, tenant_id')
    .eq('tenant_id', tenantId)
    .order('position', { ascending: true })

  const stages = (rawStages ?? []) as Array<{
    id: string
    name: string
    slug: string | null
    position: number
    color: string | null
    is_terminal: boolean
    terminal_type: string | null
    tenant_id: string
  }>

  if (!stages.length) {
    return {
      stages: [],
      total_leads: 0,
      total_converted: 0,
      conversion_rate: 0,
      added_this_week: 0,
      total_gregory: 0,
    }
  }

  // Bulk-fetch all leads + this-week count in parallel
  const [leadsResult, addedResult] = await Promise.all([
    supabase
      .from('leads')
      .select(
        'id, first_name, last_name, company_name, city, state, score, assigned_to, red_flags, last_activity_at, stage_id, ghl_pipeline_stage_id, created_at'
      )
      .eq('tenant_id', tenantId),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', weekAgo),
  ])

  type RawLead = {
    id: string
    first_name: string | null
    last_name: string | null
    company_name: string | null
    city: string | null
    state: string | null
    score: number | null
    assigned_to: string | null
    red_flags: unknown
    last_activity_at: string | null
    stage_id: string | null
    ghl_pipeline_stage_id: string | null
    created_at: string
  }

  const allLeads = (leadsResult.data ?? []) as RawLead[]
  const addedThisWeek = addedResult.count ?? 0

  // Partition leads by stage
  const stageLeadMap = new Map<string, RawLead[]>()
  for (const s of stages) stageLeadMap.set(s.id, [])

  for (const lead of allLeads) {
    const sid = lead.stage_id ?? lead.ghl_pipeline_stage_id
    if (sid && stageLeadMap.has(sid)) {
      stageLeadMap.get(sid)!.push(lead)
    }
  }

  const nowMs = Date.now()
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  let totalGregory = 0
  let totalConverted = 0

  const enrichedStages: PipelineStageDetail[] = stages.map((stage) => {
    const stageLeads = stageLeadMap.get(stage.id) ?? []
    const scored = stageLeads.filter((l) => l.score != null)

    const avg_score =
      scored.length > 0
        ? Math.round(scored.reduce((s, l) => s + (l.score as number), 0) / scored.length)
        : null

    const gregory_count = stageLeads.filter((l) => l.assigned_to === 'gregory').length
    const high_score_count = stageLeads.filter((l) => (l.score ?? 0) >= 80).length
    const flagged_count = stageLeads.filter((l) => redFlagged(l.red_flags)).length
    const active_this_week = stageLeads.filter(
      (l) =>
        l.last_activity_at &&
        nowMs - new Date(l.last_activity_at).getTime() < sevenDaysMs
    ).length

    totalGregory += gregory_count

    if (
      isWonStage({
        is_terminal: !!stage.is_terminal,
        terminal_type: stage.terminal_type,
        slug: stage.slug,
        name: stage.name,
      })
    ) {
      totalConverted += stageLeads.length
    }

    // Top 5 leads for preview cards, sorted by score desc
    const top_leads: PipelineTopLead[] = [...stageLeads]
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
      .slice(0, 5)
      .map((l) => ({
        id: l.id,
        first_name: l.first_name,
        last_name: l.last_name,
        company_name: l.company_name,
        city: l.city,
        state: l.state,
        score: l.score,
        assigned_to: l.assigned_to,
        red_flags: l.red_flags,
        last_activity_at: l.last_activity_at,
      }))

    return {
      id: stage.id,
      name: stage.name,
      slug: stage.slug,
      position: stage.position ?? 0,
      color: stage.color,
      is_terminal: !!stage.is_terminal,
      terminal_type: stage.terminal_type,
      lead_count: stageLeads.length,
      avg_score,
      gregory_count,
      high_score_count,
      flagged_count,
      active_this_week,
      top_leads,
    }
  })

  const total_leads = allLeads.length
  const conversion_rate = total_leads > 0 ? (totalConverted / total_leads) * 100 : 0

  return {
    stages: enrichedStages,
    total_leads,
    total_converted: totalConverted,
    conversion_rate,
    added_this_week: addedThisWeek,
    total_gregory: totalGregory,
  }
}

// ─── API Handler ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenant_id') ?? DEMO_TENANT
  const data = await fetchPipelineDetail(tenantId)
  return NextResponse.json(data)
}
