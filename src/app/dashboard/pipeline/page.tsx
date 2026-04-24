import { fetchPipelineDetail } from '@/app/api/dashboard/pipeline-detail/route'
import { PipelinePageClient } from './PipelinePageClient'

export const metadata = {
  title: 'Pipeline — Saul LeadGen',
}

const DEMO_TENANT = '00000000-0000-0000-0000-000000000001'

export default async function PipelinePage() {
  const data = await fetchPipelineDetail(DEMO_TENANT)
  return <PipelinePageClient data={data} />
}
