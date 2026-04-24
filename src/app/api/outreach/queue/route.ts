import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseQuery } from '@/lib/validation/parse'
import { outreachQueueQuerySchema } from '@/lib/validation/schemas'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const parsed = parseQuery(outreachQueueQuerySchema, req.nextUrl)
  if (!parsed.success) return parsed.response
  const { tenant_id: tenantId, status, limit } = parsed.data

  const supabase = createServerClient()

  const { count: pendingCount, error: cErr } = await supabase
    .from('outreach_queue')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 })
  }

  let q = supabase
    .from('outreach_queue')
    .select(
      `
      *,
      leads ( company_name, score, first_name, last_name, company_location, assigned_to )
    `,
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status !== 'all') {
    q = q.eq('status', status)
  }

  const { data, error } = await q
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    items: data ?? [],
    pending_count: pendingCount ?? 0,
  })
}
