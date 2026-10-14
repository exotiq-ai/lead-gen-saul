export type Tenant = { id: string; name: string; slug: string; icon: string }

// Seeded tenants must resolve synchronously, before /api/tenants responds.
export const TENANTS: Tenant[] = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Exotiq', slug: 'exotiq', icon: '🏎️' },
  { id: '11111111-1111-1111-1111-111111111111', name: 'MedSpa Boulder', slug: 'medspa-boulder', icon: '💆' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Ask Saul', slug: 'ask-saul', icon: '☎️' },
]

export const TENANT_SLUG_TO_UUID: Record<string, string> = Object.fromEntries(
  TENANTS.map(t => [t.slug, t.id]),
)
export const TENANT_UUID_TO_SLUG: Record<string, string> = Object.fromEntries(
  TENANTS.map(t => [t.id, t.slug]),
)

export function findTenant(value: string | null, tenants: Tenant[]): Tenant | undefined {
  return tenants.find(t => t.slug === value || t.id === value)
}

// A non-UUID is deliberate: APIs reject an unresolved selection rather than
// quietly reading the default tenant. No tenant-scoped UI mounts in this state.
export const UNRESOLVED_TENANT_ID = 'unresolved-tenant'

export function resolveTenantId(param: string | null, stored: string | null, tenants: Tenant[]): string {
  const lookup = (value: string) => findTenant(value, tenants) ?? findTenant(value, TENANTS)
  // An explicit URL always wins, including unknown/pending catalog entries.
  if (param !== null) return lookup(param)?.id ?? UNRESOLVED_TENANT_ID
  if (stored) return lookup(stored)?.id ?? UNRESOLVED_TENANT_ID
  return TENANTS[0].id
}
