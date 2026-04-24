import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseQuery } from '@/lib/validation/parse'
import { enrichmentStatusQuerySchema } from '@/lib/validation/schemas'

export const runtime = 'nodejs'

const STATUSES = ['pending', 'processing', 'completed', 'failed', 'skipped'] as const

export async function GET(req: NextRequest) {
  const parsed = parseQuery(enrichmentStatusQuerySchema, req.nextUrl)
  if (!parsed.success) return parsed.response
  const { tenant_id: tenantId } = parsed.data

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('enrichments')
    .select('status')
    .eq('tenant_id', tenantId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const counts: Record<string, number> = {}
  for (const s of STATUSES) counts[s] = 0
  for (const row of data ?? []) {
    const st = (row as { status: string }).status
    if (st in counts) counts[st]++
  }

  return NextResponse.json({ counts, total: data?.length ?? 0 })
}
