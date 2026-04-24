import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseQuery } from '@/lib/validation/parse'
import { scoringHistoryQuerySchema } from '@/lib/validation/schemas'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const parsed = parseQuery(scoringHistoryQuerySchema, req.nextUrl)
  if (!parsed.success) return parsed.response
  const { lead_id, tenant_id } = parsed.data

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('scoring_history')
    .select('*')
    .eq('lead_id', lead_id)
    .eq('tenant_id', tenant_id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ history: data ?? [] })
}
