import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEMO_TENANT_ID = '00000000-0000-0000-0000-000000000001'
const TERMINAL_STATUSES = ['converted', 'lost', 'disqualified']

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenant_id') ?? DEMO_TENANT_ID

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
