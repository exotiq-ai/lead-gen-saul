import { Suspense } from 'react'
import { fetchPipelineDetail } from '@/app/api/dashboard/pipeline-detail/route'
import { PipelinePageClient } from './PipelinePageClient'

export const metadata = {
  title: 'Pipeline — Saul LeadGen',
}

const TENANT_MAP: Record<string, string> = {
  exotiq: '00000000-0000-0000-0000-000000000001',
  'medspa-boulder': '11111111-1111-1111-1111-111111111111',
}

interface Props {
  searchParams: Promise<{ tenant?: string }>
}

export default async function PipelinePage({ searchParams }: Props) {
  const { tenant } = await searchParams
  const tenantId = (tenant && TENANT_MAP[tenant]) || TENANT_MAP.exotiq
  const data = await fetchPipelineDetail(tenantId)
  return (
    <Suspense fallback={null}>
      <PipelinePageClient data={data} />
    </Suspense>
  )
}
