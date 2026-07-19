import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { requireOutreachMutation } from '@/lib/outreach/serverAuth'
import { enrollSequenceBatch } from '@/lib/outreach/sequenceEnrollment'
import { EXOTIQ_SEQUENCE_TENANT_ID } from '@/lib/ghl/sequence'

export const runtime = 'nodejs'

const bodySchema = z.object({
  tenant_id: z.string().uuid(),
  mode: z.enum(['demo', 'live']),
  batch_key: z.string().min(3).max(120),
  queue_ids: z.array(z.string().uuid()).max(25).optional(),
  demo_contact: z.object({
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    email: z.string().email(),
    companyName: z.string().max(160).optional(),
    phone: z.string().max(40).nullable().optional(),
  }).optional(),
  started_at: z.string().datetime().optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireOutreachMutation(req)
  if (!auth.ok) return auth.response
  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await req.json())
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'invalid enrollment request' }, { status: 400 })
  }
  if (parsed.tenant_id !== EXOTIQ_SEQUENCE_TENANT_ID) {
    return NextResponse.json({ error: 'sequence enrollment is restricted to the Exotiq tenant' }, { status: 400 })
  }
  try {
    const result = await enrollSequenceBatch(createServerClient(), {
      tenantId: parsed.tenant_id,
      mode: parsed.mode,
      batchKey: parsed.batch_key,
      queueIds: parsed.queue_ids,
      demoContact: parsed.demo_contact,
      startedAt: parsed.started_at,
    })
    return NextResponse.json({ ok: true, actor: auth.actor, ...result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'sequence enrollment failed' }, { status: 400 })
  }
}
