import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseQuery } from '@/lib/validation/parse'
import { defaultTenantQuerySchema } from '@/lib/validation/schemas'

export const runtime = 'nodejs'

// GET /api/outreach/templates?tenant_id=...
//
// Returns the active outreach_sequences for this tenant. Each row carries a
// JSONB `steps` array of templates (see 010_outreach_templates_seed.sql for
// the canonical shape). The python draft skill picks the variant whose
// score band contains the lead's score. SDRs edit copy via PATCH below.
export async function GET(req: NextRequest) {
  const parsed = parseQuery(defaultTenantQuerySchema, req.nextUrl)
  if (!parsed.success) return parsed.response
  const { tenant_id: tenantId } = parsed.data

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('outreach_sequences')
    .select('id, name, slug, description, steps, is_active, updated_at')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sequences: data ?? [] })
}
