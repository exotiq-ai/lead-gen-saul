import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { authenticatedDashboardUser } from '@/lib/auth/server'
import { EXOTIQ_SEQUENCE_TENANT_ID } from '@/lib/ghl/sequence'
import { runDueSequenceActions } from '@/lib/outreach/sequenceRunner'

export const runtime = 'nodejs'

const bodySchema = z.object({
  tenant_id: z.string().uuid().default(EXOTIQ_SEQUENCE_TENANT_ID),
  enrollment_id: z.string().uuid().optional(),
  demo_fast_forward: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(25),
})

function tokenEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function authorized(req: NextRequest) {
  const expected = process.env.SEQUENCE_RUNNER_TOKEN || ''
  const supplied = req.headers.get('x-sequence-runner-token') || ''
  if (expected && supplied && tokenEqual(expected, supplied)) return true
  const auth = await authenticatedDashboardUser(req, NextResponse.next())
  return auth.ok
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'unauthorized sequence runner' }, { status: 401 })
  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await req.json().catch(() => ({})))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'invalid runner request' }, { status: 400 })
  }
  if (parsed.tenant_id !== EXOTIQ_SEQUENCE_TENANT_ID) return NextResponse.json({ error: 'wrong tenant' }, { status: 400 })
  if (parsed.demo_fast_forward && !parsed.enrollment_id) {
    return NextResponse.json({ error: 'demo fast-forward requires an explicit enrollment id' }, { status: 400 })
  }
  try {
    const result = await runDueSequenceActions(createServerClient(), {
      tenantId: parsed.tenant_id,
      enrollmentId: parsed.enrollment_id,
      demoFastForward: parsed.demo_fast_forward,
      limit: parsed.limit,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'sequence runner failed' }, { status: 500 })
  }
}
