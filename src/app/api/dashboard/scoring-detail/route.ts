import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const DEMO_TENANT_ID = '00000000-0000-0000-0000-000000000001'

const FLAG_SEVERITY: Record<string, string> = {
  below_fleet_minimum: 'high',
  experience_only_operator: 'medium',
  broker_not_operator: 'critical',
  is_dealership: 'high',
  is_franchise: 'medium',
  wrong_icp: 'critical',
  bounced_email: 'high',
  bad_data: 'medium',
  competitor: 'critical',
  unsubscribed: 'low',
  stale_90d: 'low',
  duplicate: 'medium',
  negative_reply: 'high',
}

function avg(nums: number[]): number {
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenant_id') ?? DEMO_TENANT_ID

  try {
    const supabase = createServerClient()

    const { data: leads, error } = await supabase
      .from('leads')
      .select('score, icp_fit_score, engagement_score, score_breakdown, status, assigned_to, source, red_flags')
      .eq('tenant_id', tenantId)

    if (error) throw error

    const rows = leads ?? []
    const scored = rows.filter((l) => l.score != null && l.score > 0)

    const allScoreNums = scored.map((l) => l.score as number)
    const icpNums = scored.map((l) => (l.icp_fit_score as number) ?? 0)
    const engNums = scored.map((l) => (l.engagement_score as number) ?? 0)

    // Tier buckets
    const tierDefs = [
      { tier: 1, label: 'Low (0–24)', min: 0, max: 24 },
      { tier: 2, label: 'Below Average (25–49)', min: 25, max: 49 },
      { tier: 3, label: 'Above Average (50–74)', min: 50, max: 74 },
      { tier: 4, label: 'High (75–100)', min: 75, max: 100 },
    ]
    const score_by_tier = tierDefs.map((t) => {
      const bucket = scored.filter(
        (l) => (l.score as number) >= t.min && (l.score as number) <= t.max,
      )
      return {
        tier: t.tier,
        label: t.label,
        count: bucket.length,
        avg_score: round1(avg(bucket.map((l) => l.score as number))),
      }
    })

    // Stage breakdown
    const stageMap = new Map<string, number[]>()
    for (const l of scored) {
      const stage = l.status ?? 'unknown'
      if (!stageMap.has(stage)) stageMap.set(stage, [])
      stageMap.get(stage)!.push(l.score as number)
    }
    const score_by_stage = Array.from(stageMap.entries())
      .map(([stage, scores]) => ({
        stage,
        count: scores.length,
        avg_score: round1(avg(scores)),
      }))
      .sort((a, b) => b.avg_score - a.avg_score)

    // Source breakdown
    const sourceMap = new Map<string, number[]>()
    for (const l of scored) {
      const source = (l.source as string) || 'unknown'
      if (!sourceMap.has(source)) sourceMap.set(source, [])
      sourceMap.get(source)!.push(l.score as number)
    }
    const score_by_source = Array.from(sourceMap.entries())
      .map(([source, scores]) => ({
        source,
        count: scores.length,
        avg_score: round1(avg(scores)),
      }))
      .sort((a, b) => b.avg_score - a.avg_score)

    // Gregory vs Team
    const gregScores = scored
      .filter((l) => l.assigned_to === 'gregory')
      .map((l) => l.score as number)
    const teamScores = scored
      .filter((l) => l.assigned_to !== 'gregory')
      .map((l) => l.score as number)

    // Red flag breakdown (process JSONB arrays in JS)
    const flagCounts = new Map<string, number>()
    for (const l of rows) {
      const flags = l.red_flags
      if (!Array.isArray(flags)) continue
      for (const flag of flags) {
        if (flag?.code) {
          flagCounts.set(flag.code, (flagCounts.get(flag.code) ?? 0) + 1)
        }
      }
    }
    const red_flag_breakdown = Array.from(flagCounts.entries())
      .map(([code, count]) => ({
        code,
        count,
        severity: FLAG_SEVERITY[code] ?? 'medium',
      }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({
      total_scored: scored.length,
      avg_score: round1(avg(allScoreNums)),
      avg_icp_fit: round1(avg(icpNums)),
      avg_engagement: round1(avg(engNums)),
      score_by_tier,
      score_by_stage,
      score_by_source,
      red_flag_breakdown,
      gregory_avg_score: round1(avg(gregScores)),
      team_avg_score: round1(avg(teamScores)),
      all_scores: scored.map((l) => ({ score: l.score as number })),
      icp_scores: icpNums.map((s) => ({ score: s })),
    })
  } catch (err) {
    console.error('[scoring-detail]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
