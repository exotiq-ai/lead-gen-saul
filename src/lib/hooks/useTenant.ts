'use client'

import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { useDashboardStore } from '@/stores/dashboardStore'
import { TENANTS, findTenant, resolveTenantId, parseTenantCatalog, type Tenant } from '@/lib/tenants/catalog'

export { TENANTS, TENANT_SLUG_TO_UUID, TENANT_UUID_TO_SLUG, type Tenant } from '@/lib/tenants/catalog'

const tenantsFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error('Failed to load tenants')
    return r.json().then(parseTenantCatalog)
  })

/** Shared live catalog for both selectors, with all seeded tenants available
 * synchronously during loading or a catalog outage. */
export function useTenants(): Tenant[] {
  const { data } = useSWR('/api/tenants', tenantsFetcher, {
    revalidateOnFocus: false,
    refreshInterval: 5 * 60 * 1000,
    fallbackData: { tenants: TENANTS },
  })
  return data?.tenants ?? TENANTS
}

/** URL slug/UUID > persisted selection > default. Never consult a second,
 * independently resolved window global or default an unknown URL to Exotiq. */
export function useTenantId(): string {
  const params = useSearchParams()
  const { activeTenantId } = useDashboardStore()
  const tenants = useTenants()
  return resolveTenantId(params.get('tenant'), activeTenantId, tenants)
}

export function useTenantSlug(): string {
  const uuid = useTenantId()
  const tenants = useTenants()
  const params = useSearchParams()
  return findTenant(uuid, tenants)?.slug ?? findTenant(uuid, TENANTS)?.slug ?? params.get('tenant') ?? 'unresolved-tenant'
}
