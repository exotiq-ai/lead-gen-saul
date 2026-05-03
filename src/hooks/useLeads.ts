'use client'

import useSWR from 'swr'
import type { KeyedMutator } from 'swr'
import { useFilterStore } from '@/stores/filterStore'
import { useDashboardStore } from '@/stores/dashboardStore'
import type { Lead } from '@/types'

interface LeadsResponseMeta {
  total: number
  page: number
  limit: number
  totalPages: number
  offset: number
  has_more: boolean
  red_flag_count: number
  gregory_count: number
  converted_this_month: number
}

interface LeadsResponse {
  data: Lead[]
  meta: LeadsResponseMeta
  // Legacy fields the API also emits; kept here to preserve callers
  // that haven't migrated yet.
  leads?: Lead[]
  total?: number
  page?: number
  limit?: number
  has_more?: boolean
}

interface UseLeadsResult {
  leads: Lead[]
  total: number
  isLoading: boolean
  isError: boolean
  mutate: KeyedMutator<LeadsResponse>
}

function buildLeadsUrl(params: Record<string, string | string[] | boolean | null>): string {
  const url = new URL('/api/leads', typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue
    if (Array.isArray(value)) {
      if (value.length > 0) {
        url.searchParams.set(key, value.join(','))
      }
    } else {
      url.searchParams.set(key, String(value))
    }
  }

  return url.pathname + url.search
}

async function fetchLeads(url: string): Promise<LeadsResponse> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch leads: ${res.status}`)
  }
  return res.json() as Promise<LeadsResponse>
}

export function useLeads(): UseLeadsResult {
  const { search, statusFilter, assignedToFilter, sourceFilter, redFlagsOnly } = useFilterStore()
  const { activeTenantId, selectedStageId, scoreRange, freshnessFilter, timeRange } = useDashboardStore()

  const url = buildLeadsUrl({
    tenant_id: activeTenantId,
    search: search || null,
    status: statusFilter,
    assigned_to: assignedToFilter !== 'all' ? assignedToFilter : null,
    source: sourceFilter,
    red_flags_only: redFlagsOnly || null,
    stage_id: selectedStageId,
    score_min: scoreRange ? String(scoreRange[0]) : null,
    score_max: scoreRange ? String(scoreRange[1]) : null,
    freshness: freshnessFilter,
    time_range: timeRange,
  })

  const { data, error, isLoading, mutate } = useSWR<LeadsResponse>(url, fetchLeads, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  })

  return {
    leads: data?.data ?? data?.leads ?? [],
    total: data?.meta?.total ?? data?.total ?? 0,
    isLoading,
    isError: Boolean(error),
    mutate,
  }
}
