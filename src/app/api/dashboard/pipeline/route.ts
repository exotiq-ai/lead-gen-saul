import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseQuery } from '@/lib/validation/parse'
import { requiredTenantIdQuerySchema } from '@/lib/validation/schemas'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const parsed = parseQuery(requiredTenantIdQuerySchema, req.nextUrl)
  if (!parsed.success) return parsed.response
  const { tenant_id: tenantId } = parsed.data

  const supabase = createServerClient()

  // Fetch pipeline stages
  const { data: stages, error: stagesError } = await supabase
    .from('pipeline_stages')
    .select('id, name, position, color')
    .order('position', { ascending: true })

  if (stagesError || !stages?.length) {
    // Fall back to status-based grouping if no pipeline_stages table
    const { data: leads } = await supabase
      .from('leads')
      .select('status, score')
      .eq('tenant_id', tenantId)
      .not('status', 'in', '(lost,disqualified)')

    const statusGroups: Record<string, { count: number; totalScore: number; scoreCount: number }> = {}
    const ORDER = ['new', 'enriching', 'scored', 'outreach', 'engaged', 'qualified', 'converted']
    for (const status of ORDER) {
      statusGroups[status] = { count: 0, totalScore: 0, scoreCount: 0 }
    }
    for (const lead of leads ?? []) {
      const s = lead.status as string
      if (!statusGroups[s]) statusGroups[s] = { count: 0, totalScore: 0, scoreCount: 0 }
      statusGroups[s].count++
      if (lead.score != null) {
        statusGroups[s].totalScore += lead.score as number
        statusGroups[s].scoreCount++
      }
    }
    const STATUS_LABELS: Record<string, string> = {
      new: 'New Lead', enriching: 'Enriching', scored: 'Scored',
      outreach: 'Outreach', engaged: 'Engaged', qualified: 'Qualified', converted: 'Won',
    }
    const result = ORDER
      .filter(s => statusGroups[s]?.count > 0)
      .map((s, i) => ({
        id: s,
        name: STATUS_LABELS[s] ?? s,
        count: statusGroups[s].count,
        avgScore: statusGroups[s].scoreCount > 0
          ? Math.round(statusGroups[s].totalScore / statusGroups[s].scoreCount)
          : 0,
        position: i,
      }))
    return NextResponse.json({ stages: result })
  }

  // Fetch leads with stage_id
  const { data: leads } = await supabase
    .from('leads')
    .select('stage_id, ghl_pipeline_stage_id, score')
    .eq('tenant_id', tenantId)
    .not('status', 'in', '(lost,disqualified)')

  const stageMap: Record<string, { count: number; totalScore: number; scoreCount: number }> = {}
  for (const stage of stages) {
    stageMap[stage.id] = { count: 0, totalScore: 0, scoreCount: 0 }
  }
  for (const lead of leads ?? []) {
    const sid = (lead as Record<string, unknown>).stage_id as string
      ?? (lead as Record<string, unknown>).ghl_pipeline_stage_id as string
    if (sid && stageMap[sid]) {
      stageMap[sid].count++
      if (lead.score != null) {
        stageMap[sid].totalScore += lead.score as number
        stageMap[sid].scoreCount++
      }
    }
  }

  const result = stages.map((stage, i) => ({
    id: stage.id,
    name: stage.name,
    count: stageMap[stage.id]?.count ?? 0,
    avgScore: stageMap[stage.id]?.scoreCount > 0
      ? Math.round(stageMap[stage.id].totalScore / stageMap[stage.id].scoreCount)
      : 0,
    position: stage.position ?? i,
    color: stage.color ?? undefined,
  })).filter(s => s.count > 0)

  return NextResponse.json({ stages: result })
}
