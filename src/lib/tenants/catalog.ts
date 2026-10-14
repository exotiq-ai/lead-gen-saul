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

/** Reject corrupt/empty metadata so SWR retains the last good catalog or seeds.
 * This catalog is display/routing metadata, not an authorization grant. */
export function parseTenantCatalog(payload: unknown): { tenants: Tenant[] } {
  const entries = payload && typeof payload === 'object' && 'tenants' in payload ? payload.tenants : null
  if (!Array.isArray(entries) || !entries.length) throw new Error('Invalid tenant catalog')
  const ids = new Set<string>()
  const slugs = new Set<string>()
  for (const tenant of entries) {
    if (!tenant || typeof tenant !== 'object'
      || typeof tenant.id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(tenant.id)
      || typeof tenant.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenant.slug)
      || typeof tenant.name !== 'string' || !tenant.name.trim()
      || typeof tenant.icon !== 'string' || !tenant.icon.trim()
      || ids.has(tenant.id) || slugs.has(tenant.slug)) throw new Error('Invalid tenant catalog')
    ids.add(tenant.id)
    slugs.add(tenant.slug)
  }
  return { tenants: entries as Tenant[] }
}

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
