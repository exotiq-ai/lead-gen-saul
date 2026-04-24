import { NextRequest, NextResponse } from 'next/server'
import { parseJsonBody } from '@/lib/validation/parse'
import { enrichmentTriggerBodySchema } from '@/lib/validation/schemas'
import { triggerEnrichment } from '@/lib/enrichment/orchestrator'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req, enrichmentTriggerBodySchema)
  if (!parsed.success) return parsed.response

  const { lead_id, tenant_id, process: shouldProcess } = parsed.data
  const result = await triggerEnrichment(lead_id, tenant_id, { process: shouldProcess })

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Trigger failed' }, { status: 400 })
  }

  return NextResponse.json({
    enrichment_id: result.enrichment_id,
    processed: result.processed ?? false,
  })
}
