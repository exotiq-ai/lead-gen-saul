'use client'

import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { useDashboardStore } from '@/stores/dashboardStore'

// ─── Static fallback ──────────────────────────────────────────────────
//
// Stage 3a moves tenant metadata to the DB (`tenants` table). Existing
// callers that do `useTenantId()` synchronously can't wait for a fetch,
// so we keep a hard-coded fallback map that mirrors the seeded tenants.
// New tenants added in the DB get picked up via the SWR fetch below;
// onboarding a third tenant is a row insert, not a deploy.

export const TENANT_SLUG_TO_UUID: Record<string, string> = {
  exotiq: '00000000-0000-0000-0000-000000000001',
  'medspa-boulder': '11111111-1111-1111-1111-111111111111',
}

export const TENANT_UUID_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(TENANT_SLUG_TO_UUID).map(([slug, uuid]) => [uuid, slug]),
)

export const TENANTS = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Exotiq.ai', slug: 'exotiq', icon: '🚗' },
  { id: '11111111-1111-1111-1111-111111111111', name: 'MedSpa Boulder', slug: 'medspa-boulder', icon: '💉' },
]

const DEFAULT_ID = '00000000-0000-0000-0000-000000000001'

// ─── DB-backed catalog ────────────────────────────────────────────────

export type Tenant = {
  id: string
  name: string
  slug: string
  icon: string
}

const tenantsFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error('Failed to load tenants')
    return r.json() as Promise<{ tenants: Tenant[] }>
  })

/** Live tenant list from /api/tenants. Falls back to the static TENANTS
 * array when the fetch hasn't resolved yet. New tenants in the DB
 * appear here as soon as SWR refreshes.
 */
export function useTenants(): Tenant[] {
  const { data } = useSWR('/api/tenants', tenantsFetcher, {
    revalidateOnFocus: false,
    refreshInterval: 5 * 60 * 1000, // 5min
    fallbackData: { tenants: TENANTS },
  })
  return data?.tenants ?? TENANTS
}

// ─── Per-render hooks ─────────────────────────────────────────────────

/**
 * Single source of truth for current tenant UUID.
 * Priority: URL ?tenant= param > Zustand store > default
 */
export function useTenantId(): string {
  const params = useSearchParams()
  const { activeTenantId } = useDashboardStore()
  const tenants = useTenants()

  // Build a slug→uuid map that includes both the static fallback and
  // any DB-only tenants the API has surfaced.
  const slugToUuid: Record<string, string> = { ...TENANT_SLUG_TO_UUID }
  const uuidToSlug: Record<string, string> = { ...TENANT_UUID_TO_SLUG }
  for (const t of tenants) {
    slugToUuid[t.slug] = t.id
    uuidToSlug[t.id] = t.slug
  }

  // 1. URL param wins.
  const slug = params.get('tenant')
  if (slug && slugToUuid[slug]) return slugToUuid[slug]

  // 2. Zustand store. Store may hold either UUID or slug.
  if (activeTenantId && slugToUuid[activeTenantId]) return slugToUuid[activeTenantId]
  if (activeTenantId && uuidToSlug[activeTenantId]) return activeTenantId

  // 3. Window legacy fallback.
  if (typeof window !== 'undefined' && window.__SAUL_TENANT_ID__) {
    return window.__SAUL_TENANT_ID__
  }

  return DEFAULT_ID
}

/** Returns the current tenant slug (for URL building). */
export function useTenantSlug(): string {
  const uuid = useTenantId()
  const tenants = useTenants()
  const fromDb = tenants.find((t) => t.id === uuid)?.slug
  return fromDb ?? TENANT_UUID_TO_SLUG[uuid] ?? 'exotiq'
}
