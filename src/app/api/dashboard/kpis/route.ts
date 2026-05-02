import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseQuery } from '@/lib/validation/parse'
import { requiredTenantIdQuerySchema } from '@/lib/validation/schemas'

export const runtime = 'nodejs'

function trend(current: number, previous: number): number {
  if (previous === 0) return 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export async function GET(req: NextRequest) {
  const parsed = parseQuery(requiredTenantIdQuerySchema, req.nextUrl)
  if (!parsed.success) return parsed.response
  const { tenant_id: tenantId } = parsed.data

  const supabase = createServerClient()
  const now = new Date()
  const ms7  = 7  * 24 * 60 * 60 * 1000
  const ms14 = 14 * 24 * 60 * 60 * 1000
  const ms30 = 30 * 24 * 60 * 60 * 1000
  const ms60 = 60 * 24 * 60 * 60 * 1000

  const d7   = new Date(now.getTime() - ms7).toISOString()
  const d14  = new Date(now.getTime() - ms14).toISOString()
  const d30  = new Date(now.getTime() - ms30).toISOString()
  const d60  = new Date(now.getTime() - ms60).toISOString()

  // --- Active leads (not lost/disqualified) ---
  const [{ count: totalActive }, { count: totalActivePrev }] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('status', 'in', '(lost,disqualified)'),
    supabase.from('leads').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('status', 'in', '(lost,disqualified)')
      .lte('created_at', d30)
      .gte('created_at', d60),
  ])

  // --- Velocity: leads created last 7d vs prev 7d ---
  const [{ count: velocityNow }, { count: velocityPrev }] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).gte('created_at', d7),
    supabase.from('leads').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).gte('created_at', d14).lte('created_at', d7),
  ])

  // --- Scores + status for all active leads ---
  const { data: allLeads } = await supabase
    .from('leads')
    .select('score, status, created_at')
    .eq('tenant_id', tenantId)
    .not('status', 'eq', 'disqualified')

  const rows = allLeads ?? []
  const scores = rows.filter(l => l.score != null).map(l => l.score as number)
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0

  const convertedCount = rows.filter(l => l.status === 'converted').length
  const conversionRate = rows.length > 0 ? (convertedCount / rows.length) * 100 : 0

  // Prev period (created before d30) for avg score trend
  const prevRows = rows.filter(l => l.created_at < d30)
  const prevScores = prevRows.filter(l => l.score != null).map(l => l.score as number)
  const avgScorePrev = prevScores.length > 0 ? prevScores.reduce((a, b) => a + b, 0) / prevScores.length : avgScore

  const prevConverted = prevRows.filter(l => l.status === 'converted').length
  const prevConvRate = prevRows.length > 0 ? (prevConverted / prevRows.length) * 100 : conversionRate

  // --- Sparklines: 7 daily buckets ending today (UTC) ---
  //
  // The previous implementation keyed every sparkline on `created_at` for the
  // last 7 days. For a stable population where most leads were created weeks
  // ago, that meant `active` and `velocity` sparklines were structurally
  // [0,0,0,0,0,0,0] forever. Fix:
  //
  //   - active sparkline   = running count of active leads at end-of-day
  //                          (active = not lost AND not disqualified)
  //   - velocity sparkline = leads created in 24h window ending that day
  //                          (the meaningful per-day signal)
  //   - score sparkline    = avg score of leads existing at end-of-day
  //                          (falls back to overall avg when bucket empty)
  //   - conversion         = converted / total at end-of-day
  //
  // We compute end-of-day cutoffs in UTC and walk the row set once per day.
  const dayLabels: string[] = []
  const dayCutoffs: number[] = []
  const todayUtc = new Date(now.toISOString().split('T')[0] + 'T23:59:59.999Z').getTime()
  for (let i = 6; i >= 0; i--) {
    const cutoff = todayUtc - i * 24 * 60 * 60 * 1000
    dayCutoffs.push(cutoff)
    dayLabels.push(new Date(cutoff).toISOString().split('T')[0])
  }

  const activeSparkline: number[] = []
  const velocitySparkline: number[] = []
  const scoreSparkline: number[] = []
  const convSparkline: number[] = []

  for (let i = 0; i < dayCutoffs.length; i++) {
    const cutoffMs = dayCutoffs[i]
    const dayStartMs = cutoffMs - 24 * 60 * 60 * 1000

    let activeAtEod = 0
    let createdToday = 0
    let scoreSum = 0
    let scoreCnt = 0
    let totalAtEod = 0
    let convertedAtEod = 0

    for (const lead of rows) {
      const createdMs = new Date(lead.created_at as string).getTime()
      if (createdMs > cutoffMs) continue
      // Existed at end-of-day. We don't have full status history so we
      // approximate using the current status: lost/disqualified leads are
      // excluded from the active count (matches the headline metric).
      totalAtEod++
      if (lead.status !== 'lost' && lead.status !== 'disqualified') activeAtEod++
      if (lead.status === 'converted') convertedAtEod++
      if (lead.score != null) {
        scoreSum += lead.score as number
        scoreCnt++
      }
      if (createdMs >= dayStartMs && createdMs <= cutoffMs) createdToday++
    }

    activeSparkline.push(activeAtEod)
    velocitySparkline.push(createdToday)
    scoreSparkline.push(scoreCnt > 0 ? Math.round(scoreSum / scoreCnt) : Math.round(avgScore))
    convSparkline.push(
      totalAtEod > 0
        ? Math.round((convertedAtEod / totalAtEod) * 1000) / 10
        : Math.round(conversionRate * 10) / 10,
    )
  }

  return NextResponse.json({
    total_active:       totalActive ?? 0,
    total_active_trend: trend(totalActive ?? 0, totalActivePrev ?? 0),
    velocity_per_week:  velocityNow ?? 0,
    velocity_trend:     trend(velocityNow ?? 0, velocityPrev ?? 0),
    avg_score:          Math.round(avgScore * 10) / 10,
    avg_score_trend:    trend(avgScore, avgScorePrev),
    conversion_rate:    Math.round(conversionRate * 10) / 10,
    conversion_trend:   trend(conversionRate, prevConvRate),
    sparklines: {
      active:     activeSparkline,
      velocity:   velocitySparkline,
      score:      scoreSparkline,
      conversion: convSparkline,
    },
  })
}
