import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type TimeRange = '7d' | '30d' | '90d' | 'all'

function rangeToMs(range: TimeRange): number | null {
  switch (range) {
    case '7d':  return 7  * 24 * 60 * 60 * 1000
    case '30d': return 30 * 24 * 60 * 60 * 1000
    case '90d': return 90 * 24 * 60 * 60 * 1000
    case 'all': return null
  }
}

const OUTBOUND_SOURCES = new Set(['outbound', 'api'])

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenant_id')
  const range = (searchParams.get('range') ?? '30d') as TimeRange
  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })
  }

  const supabase = createServerClient()
  const ms = rangeToMs(range)
  const since = ms ? new Date(Date.now() - ms).toISOString() : null

  let query = supabase
    .from('leads')
    .select('created_at, source')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })

  if (since) {
    query = query.gte('created_at', since)
  }

  const { data: leads, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Build daily buckets
  const buckets: Record<string, { inbound: number; outbound: number }> = {}
  for (const lead of leads ?? []) {
    const day = (lead.created_at as string).split('T')[0]
    if (!buckets[day]) buckets[day] = { inbound: 0, outbound: 0 }
    if (OUTBOUND_SOURCES.has(lead.source as string)) {
      buckets[day].outbound++
    } else {
      buckets[day].inbound++
    }
  }

  const data = Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }))

  return NextResponse.json({ data })
}
