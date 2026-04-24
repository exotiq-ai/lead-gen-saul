import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function trend(current: number, previous: number): number {
  if (previous === 0) return 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenant_id')
  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })
  }

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

  // --- Sparklines: last 7 days, one bucket per day ---
  const recent = rows.filter(l => l.created_at >= d7)
  const dayBuckets: Record<string, { count: number; totalScore: number; scoreCount: number; converted: number }> = {}
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    const key = d.toISOString().split('T')[0]
    dayBuckets[key] = { count: 0, totalScore: 0, scoreCount: 0, converted: 0 }
  }
  for (const lead of recent) {
    const key = (lead.created_at as string).split('T')[0]
    if (dayBuckets[key]) {
      dayBuckets[key].count++
      if (lead.score != null) {
        dayBuckets[key].totalScore += lead.score as number
        dayBuckets[key].scoreCount++
      }
      if (lead.status === 'converted') dayBuckets[key].converted++
    }
  }
  const days = Object.values(dayBuckets)
  const activeSparkline   = days.map(d => d.count)
  const velocitySparkline = days.map(d => d.count)
  const scoreSparkline    = days.map(d => (d.scoreCount > 0 ? Math.round(d.totalScore / d.scoreCount) : Math.round(avgScore)))
  const convSparkline     = days.map(d => (d.count > 0 ? Math.round((d.converted / d.count) * 1000) / 10 : Math.round(conversionRate * 10) / 10))

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
