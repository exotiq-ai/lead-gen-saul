'use client'

/**
 * TenantGuard — ensures the ?tenant= param is always present in the URL.
 *
 * Problem it solves: if someone navigates to /dashboard (no ?tenant=), all
 * API calls silently default to Exotiq UUID even when the Zustand store says
 * MedSpa Boulder. This component detects the mismatch on mount and redirects
 * to add the correct ?tenant= param, keeping the tenant walls solid.
 */

import { useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useDashboardStore } from '@/stores/dashboardStore'
import { TENANT_UUID_TO_SLUG, TENANTS } from '@/lib/hooks/useTenant'

export function TenantGuard() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { activeTenantId } = useDashboardStore()

  useEffect(() => {
    const urlTenant = searchParams.get('tenant')

    // If URL already has ?tenant= we're good
    if (urlTenant) return

    // Resolve which slug to inject from Zustand store
    let slug: string | null = null

    if (activeTenantId) {
      // Store might hold UUID or slug
      slug = TENANT_UUID_TO_SLUG[activeTenantId] ?? null
      if (!slug) {
        // Maybe it's already a slug
        const found = TENANTS.find((t) => t.id === activeTenantId || t.slug === activeTenantId)
        slug = found?.slug ?? null
      }
    }

    // Only inject if we have a non-default tenant to add
    if (slug && slug !== 'exotiq') {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tenant', slug)
      router.replace(`${pathname}?${params.toString()}`)
    }
  }, [pathname, searchParams, activeTenantId, router])

  return null
}
