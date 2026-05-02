import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { parseQuery, parseJsonBody } from '@/lib/validation/parse'
import { defaultTenantQuerySchema } from '@/lib/validation/schemas'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/pipeline/stages?tenant_id=...
//
// Returns the stages for a tenant, ordered by position.
export async function GET(req: NextRequest) {
  const parsed = parseQuery(defaultTenantQuerySchema, req.nextUrl)
  if (!parsed.success) return parsed.response
  const { tenant_id: tenantId } = parsed.data

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('id, name, slug, position, color, is_terminal, terminal_type')
    .eq('tenant_id', tenantId)
    .order('position', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ stages: data ?? [] })
}

// PATCH /api/pipeline/stages
// Body: { tenant_id, order: uuid[] }
//
// Persists a new stage ordering. Implementation: walk the order list and
// assign positions 0..n-1 via N small UPDATEs. We accept N up to 32 stages
// per tenant; anything bigger should use a stored proc.
const orderBody = z.object({
  tenant_id: z.string().regex(UUID_RE),
  order: z.array(z.string().regex(UUID_RE)).min(1).max(32),
})

export async function PATCH(req: NextRequest) {
  const parsed = await parseJsonBody(req, orderBody)
  if (!parsed.success) return parsed.response
  const { tenant_id, order } = parsed.data

  const supabase = createServerClient()

  // Validate that every id belongs to this tenant before we start writing.
  const { data: existing, error: lookupErr } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('tenant_id', tenant_id)
    .in('id', order)
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 })
  const validIds = new Set((existing ?? []).map((r) => r.id as string))
  for (const id of order) {
    if (!validIds.has(id)) {
      return NextResponse.json(
        { error: `stage ${id} does not belong to tenant ${tenant_id}` },
        { status: 400 },
      )
    }
  }

  // Apply positions sequentially. Errors abort the rest.
  for (let i = 0; i < order.length; i++) {
    const { error } = await supabase
      .from('pipeline_stages')
      .update({ position: i })
      .eq('id', order[i])
      .eq('tenant_id', tenant_id)
    if (error) {
      return NextResponse.json(
        { error: `failed at index ${i}: ${error.message}` },
        { status: 500 },
      )
    }
  }

  return NextResponse.json({ ok: true, count: order.length })
}
