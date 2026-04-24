import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseQuery } from '@/lib/validation/parse'
import { agingQuerySchema } from '@/lib/validation/schemas'

export const runtime = 'nodejs'

type AgingBucket = 'active' | 'cooling' | 'stale' | 'dead'

function getBucket(lastActivityAt: string | null, createdAt: string): AgingBucket {
  const ref = lastActivityAt ?? createdAt
  const days = Math.floor((Date.now() - new Date(ref).getTime()) / (24 * 60 * 60 * 1000))
  if (days <= 7)  return 'active'
  if (days <= 30) return 'cooling'
  if (days <= 60) return 'stale'
  return 'dead'
}

export async function GET(req: NextRequest) {
  const parsed = parseQuery(agingQuerySchema, req.nextUrl)
  if (!parsed.success) return parsed.response
  const { tenant_id: tenantId } = parsed.data

  const supabase = createServerClient()
  const { data: leads, error } = await supabase
    .from('leads')
    .select('last_activity_at, created_at')
    .eq('tenant_id', tenantId)
    .not('status', 'in', '(lost,disqualified,converted)')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const counts: Record<AgingBucket, number> = { active: 0, cooling: 0, stale: 0, dead: 0 }
  for (const lead of leads ?? []) {
    const bucket = getBucket(lead.last_activity_at as string | null, lead.created_at as string)
    counts[bucket]++
  }

  const data: Array<{ bucket: AgingBucket; count: number }> = [
    { bucket: 'active',  count: counts.active  },
    { bucket: 'cooling', count: counts.cooling },
    { bucket: 'stale',   count: counts.stale   },
    { bucket: 'dead',    count: counts.dead    },
  ]

  return NextResponse.json({ data })
}
