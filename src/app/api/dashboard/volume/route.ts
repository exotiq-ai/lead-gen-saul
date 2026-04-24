import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseQuery } from '@/lib/validation/parse'
import { volumeQuerySchema } from '@/lib/validation/schemas'

export const runtime = 'nodejs'

function rangeToMs(range: '7d' | '30d' | '90d' | 'all'): number | null {
  switch (range) {
    case '7d':  return 7  * 24 * 60 * 60 * 1000
    case '30d': return 30 * 24 * 60 * 60 * 1000
    case '90d': return 90 * 24 * 60 * 60 * 1000
    case 'all': return null
  }
}

const OUTBOUND_SOURCES = new Set(['outbound', 'api'])

export async function GET(req: NextRequest) {
  const parsed = parseQuery(volumeQuerySchema, req.nextUrl)
  if (!parsed.success) return parsed.response
  const { tenant_id: tenantId, range } = parsed.data

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
