/**
 * Phase-0 isolation audit follow-up (corrected): /api/webhooks/ghl already
 * rejects (quarantines) any event whose locationId does not match the
 * route's expected Exotiq location — that check predates this session
 * (commit cb695af) and is confirmed live in production. The one real gap:
 * a quarantined event names its rejection reason generically
 * ("wrong_or_missing_location") with no indication of *whose* location it
 * actually was, so an auditor has to hand-parse the raw JSONB payload to
 * notice a rejected event actually came from a known sibling tenant (e.g.
 * AskSaul) rather than genuinely unidentifiable junk. This module makes
 * that visible in quarantine_reason itself.
 */

export const TENANT_IDS = {
  exotiq: '00000000-0000-0000-0000-000000000001',
  medspa: '11111111-1111-1111-1111-111111111111',
  askSaul: '22222222-2222-2222-2222-222222222222',
} as const

export type LocationTenantMap = Record<string, string>

/** Builds the locationId -> tenantId map from the same env vars the rest of
 * the app already uses for outbound GHL credentials (src/lib/ghl/outbound.ts),
 * so this never drifts from the tenant/location pairing already in use.
 * An unset or empty-string env var never creates a matchable entry. */
export function buildLocationTenantMap(env: Record<string, string | undefined>): LocationTenantMap {
  const pairs: Array<[string | undefined, string]> = [
    [env.GHL_LOCATION_ID, TENANT_IDS.exotiq],
    [env.GHL_MEDSPA_LOCATION_ID, TENANT_IDS.medspa],
    [env.GHL_LOCAL_SERVICES_LOCATION_ID, TENANT_IDS.askSaul],
  ]
  const map: LocationTenantMap = {}
  for (const [locationId, tenantId] of pairs) {
    if (locationId) map[locationId] = tenantId
  }
  return map
}

/** Builds a self-describing quarantine_reason for a rejected event, given
 * the locationId already extracted by extractGhlEventIdentity. The route
 * still files the row under its own owning tenant (tenant_id is NOT NULL
 * and FK-constrained; there is no neutral tenant to point at instead), but
 * quarantine_reason itself should name a recognized foreign tenant rather
 * than lumping it in with genuinely unidentifiable junk. */
export function describeQuarantineReason(locationId: string | null | undefined, map: LocationTenantMap): string {
  const knownForeignTenant = locationId ? map[locationId] : undefined
  if (knownForeignTenant) return `wrong_or_missing_location:foreign_tenant=${knownForeignTenant}`
  return 'wrong_or_missing_location:unknown'
}
