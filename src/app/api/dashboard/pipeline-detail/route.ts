import { NextRequest, NextResponse } from 'next/server'
import { parseQuery } from '@/lib/validation/parse'
import { pipelineDetailQuerySchema } from '@/lib/validation/schemas'
import { fetchPipelineDetail } from '@/lib/dashboard/pipelineDetail'

export type { PipelineTopLead, PipelineStageDetail, PipelineDetailResponse } from '@/lib/dashboard/pipelineDetail'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const parsed = parseQuery(pipelineDetailQuerySchema, req.nextUrl)
  if (!parsed.success) return parsed.response
  const { tenant_id: tenantId } = parsed.data
  const data = await fetchPipelineDetail(tenantId)
  return NextResponse.json(data)
}
