import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const SOURCE_LABELS: Record<string, string> = {
  organic:  'Organic / SEO',
  paid:     'Paid Search',
  referral: 'Referral',
  outbound: 'Apollo Outbound',
  api:      'API / Webhook',
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenant_id')
  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: leads, error } = await supabase
    .from('leads')
    .select('source, status, score')
    .eq('tenant_id', tenantId)
    .not('status', 'eq', 'disqualified')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const map: Record<string, { total: number; converted: number; totalScore: number; scoreCount: number }> = {}

  for (const lead of leads ?? []) {
    const src = (lead.source as string) ?? 'unknown'
    if (!map[src]) map[src] = { total: 0, converted: 0, totalScore: 0, scoreCount: 0 }
    map[src].total++
    if (lead.status === 'converted') map[src].converted++
    if (lead.score != null) {
      map[src].totalScore += lead.score as number
      map[src].scoreCount++
    }
  }

  const data = Object.entries(map)
    .map(([src, v]) => ({
      source:          SOURCE_LABELS[src] ?? src,
      total:           v.total,
      converted:       v.converted,
      conversion_rate: v.total > 0 ? Math.round((v.converted / v.total) * 1000) / 10 : 0,
      avg_score:       v.scoreCount > 0 ? Math.round(v.totalScore / v.scoreCount) : 0,
    }))
    .filter(d => d.total > 0)
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({ data })
}
