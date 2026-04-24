import { NextRequest, NextResponse } from 'next/server'
import { parseJsonBody } from '@/lib/validation/parse'
import { scoringCalculateBodySchema } from '@/lib/validation/schemas'
import { calculateScore } from '@/lib/scoring/engine'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req, scoringCalculateBodySchema)
  if (!parsed.success) return parsed.response

  const { lead_id, tenant_id } = parsed.data
  const result = await calculateScore(lead_id, tenant_id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json(result)
}
