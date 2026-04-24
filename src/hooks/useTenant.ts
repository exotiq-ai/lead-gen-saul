'use client'

import useSWR from 'swr'
import { useDashboardStore } from '@/stores/dashboardStore'
import type { Tenant } from '@/types'

const EXOTIQ_DEMO_TENANT: Tenant = {
  id: 'exotiq-demo',
  name: 'Exotiq',
  slug: 'exotiq',
  settings: {},
  branding: {
    logo_url: undefined,
    primary_color: '#6366f1',
    company_name: 'Exotiq',
    dashboard_title: 'Exotiq LeadGen Dashboard',
    favicon_url: undefined,
  },
  ghl_location_id: null,
  ghl_api_key: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

async function fetchTenant(id: string): Promise<Tenant> {
  const res = await fetch(`/api/tenants/${id}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch tenant: ${res.status}`)
  }
  return res.json() as Promise<Tenant>
}

export function useTenant() {
  const activeTenantId = useDashboardStore((s) => s.activeTenantId)

  const { data, error, isLoading } = useSWR<Tenant>(
    activeTenantId ? `/api/tenants/${activeTenantId}` : null,
    () => fetchTenant(activeTenantId!),
    { revalidateOnFocus: false },
  )

  if (!activeTenantId) {
    return {
      tenant: EXOTIQ_DEMO_TENANT,
      isLoading: false,
      isError: false,
    }
  }

  return {
    tenant: data ?? null,
    isLoading,
    isError: Boolean(error),
  }
}
