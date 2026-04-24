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
