'use client'

import { useSearchParams } from 'next/navigation'
import { useDashboardStore } from '@/stores/dashboardStore'

export const TENANT_SLUG_TO_UUID: Record<string, string> = {
  exotiq: '00000000-0000-0000-0000-000000000001',
  'medspa-boulder': '11111111-1111-1111-1111-111111111111',
}

export const TENANT_UUID_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(TENANT_SLUG_TO_UUID).map(([slug, uuid]) => [uuid, slug]),
)

// Canonical list used by TenantSelector and anywhere else that needs tenant metadata
export const TENANTS = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Exotiq.ai', slug: 'exotiq', icon: '🚗' },
  { id: '11111111-1111-1111-1111-111111111111', name: 'MedSpa Boulder', slug: 'medspa-boulder', icon: '💉' },
]

const DEFAULT_ID = '00000000-0000-0000-0000-000000000001'

/**
 * Single source of truth for current tenant UUID.
 * Priority: URL ?tenant= param > Zustand store > default
 */
export function useTenantId(): string {
  const params = useSearchParams()
  const { activeTenantId } = useDashboardStore()

  // 1. URL param is highest priority
  const slug = params.get('tenant')
  if (slug && TENANT_SLUG_TO_UUID[slug]) return TENANT_SLUG_TO_UUID[slug]

  // 2. Zustand store (persisted across page loads)
  if (activeTenantId && TENANT_SLUG_TO_UUID[activeTenantId]) {
    return TENANT_SLUG_TO_UUID[activeTenantId]
  }
  // Store might hold UUID directly
  if (activeTenantId && TENANT_UUID_TO_SLUG[activeTenantId]) {
    return activeTenantId
  }

  // 3. Window global (legacy)
  if (typeof window !== 'undefined' && window.__SAUL_TENANT_ID__) {
    return window.__SAUL_TENANT_ID__
  }

  return DEFAULT_ID
}

/** Returns the current tenant slug (for URL building) */
export function useTenantSlug(): string {
  const uuid = useTenantId()
  return TENANT_UUID_TO_SLUG[uuid] ?? 'exotiq'
}
