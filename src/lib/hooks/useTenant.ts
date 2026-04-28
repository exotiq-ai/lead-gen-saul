'use client'

import { useSearchParams } from 'next/navigation'

const TENANTS: Record<string, string> = {
  exotiq: '00000000-0000-0000-0000-000000000001',
  'medspa-boulder': '11111111-1111-1111-1111-111111111111',
}

const DEFAULT_ID = '00000000-0000-0000-0000-000000000001'

export function useTenantId(): string {
  const params = useSearchParams()
  const slug = params.get('tenant')
  if (slug && TENANTS[slug]) return TENANTS[slug]
  if (typeof window !== 'undefined' && window.__SAUL_TENANT_ID__) {
    return window.__SAUL_TENANT_ID__
  }
  return DEFAULT_ID
}
