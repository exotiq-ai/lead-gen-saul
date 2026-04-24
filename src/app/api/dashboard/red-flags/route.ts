import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseQuery } from '@/lib/validation/parse'
import { redFlagsQuerySchema } from '@/lib/validation/schemas'
const TERMINAL_STATUSES = ['converted', 'lost', 'disqualified']

export async function GET(req: NextRequest) {
  const parsed = parseQuery(redFlagsQuerySchema, req.nextUrl)
  if (!parsed.success) return parsed.response
  const { tenant_id: tenantId } = parsed.data

  try {
    const supabase = createServerClient()

    const { count, error } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`)
      .not('red_flags', 'is', null)
      .not('red_flags', 'eq', '[]')

    if (error) throw error

    return NextResponse.json({ count: count ?? 0 })
  } catch (err) {
    console.error('[red-flags]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
