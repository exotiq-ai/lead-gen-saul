import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { parseJsonBody } from '@/lib/validation/parse'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Body: { tenant_id, steps[] }. We don't allow renaming the sequence
// from this endpoint; SDRs can only edit the templated copy + score bands.
const stepSchema = z.object({
  variant: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
  channel: z.enum(['instagram_dm', 'email', 'sms', 'linkedin_dm']),
  score_min: z.number().int().min(0).max(100),
  score_max: z.number().int().min(0).max(100),
  body: z.string().min(1).max(8000),
})

const patchBody = z.object({
  tenant_id: z.string().regex(UUID_RE),
  steps: z.array(stepSchema).min(1).max(20),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid sequence id' }, { status: 400 })
  }
  const parsed = await parseJsonBody(req, patchBody)
  if (!parsed.success) return parsed.response
  const { tenant_id, steps } = parsed.data

  // Validate score band invariants: max >= min for each step.
  for (const s of steps) {
    if (s.score_max < s.score_min) {
      return NextResponse.json(
        { error: `step "${s.variant}": score_max (${s.score_max}) must be >= score_min (${s.score_min})` },
        { status: 400 },
      )
    }
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('outreach_sequences')
    .update({ steps, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant_id)
    .select('id, steps, updated_at')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'sequence not found' }, { status: 404 })
  return NextResponse.json({ sequence: data })
}
