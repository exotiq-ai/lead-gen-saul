import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenant_id')
  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: leads, error } = await supabase
    .from('leads')
    .select('score')
    .eq('tenant_id', tenantId)
    .not('score', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const scores = (leads ?? []).map(l => ({ score: l.score as number }))
  const avg = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b.score, 0) / scores.length * 10) / 10
    : 0

  return NextResponse.json({ leads: scores, avg_score: avg })
}
