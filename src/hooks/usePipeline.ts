'use client'

import useSWR from 'swr'
import type { KeyedMutator } from 'swr'
import { useDashboardStore } from '@/stores/dashboardStore'
import type { PipelineSummary } from '@/types'

interface UsePipelineResult {
  pipeline: PipelineSummary | null
  isLoading: boolean
  isError: boolean
  mutate: KeyedMutator<PipelineSummary>
}

async function fetchPipeline(url: string): Promise<PipelineSummary> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch pipeline: ${res.status}`)
  }
  return res.json() as Promise<PipelineSummary>
}

export function usePipeline(): UsePipelineResult {
  const { activeTenantId, timeRange } = useDashboardStore()

  const url = activeTenantId
    ? `/api/pipeline?tenant_id=${activeTenantId}&time_range=${timeRange}`
    : null

  const { data, error, isLoading, mutate } = useSWR<PipelineSummary>(
    url,
    fetchPipeline,
    {
      revalidateOnFocus: false,
      refreshInterval: 60_000,
    },
  )

  return {
    pipeline: data ?? null,
    isLoading,
    isError: Boolean(error),
    mutate,
  }
}
