import assert from 'node:assert/strict'
import test from 'node:test'

import { buildLocationTenantMap, describeQuarantineReason, TENANT_IDS } from './webhookTenant'

const ENV = {
  GHL_LOCATION_ID: 'exotiq-loc-id',
  GHL_MEDSPA_LOCATION_ID: 'medspa-loc-id',
  GHL_LOCAL_SERVICES_LOCATION_ID: 'asksaul-loc-id',
}

test('a rejected event from a known sibling tenant location names that tenant in the reason', () => {
  const map = buildLocationTenantMap(ENV)
  assert.equal(
    describeQuarantineReason('asksaul-loc-id', map),
    `wrong_or_missing_location:foreign_tenant=${TENANT_IDS.askSaul}`,
  )
  assert.equal(
    describeQuarantineReason('medspa-loc-id', map),
    `wrong_or_missing_location:foreign_tenant=${TENANT_IDS.medspa}`,
  )
})

test('a rejected event with a fully unrecognized locationId is marked unknown, not attributed to any business', () => {
  const map = buildLocationTenantMap(ENV)
  assert.equal(describeQuarantineReason('some-other-business-location', map), 'wrong_or_missing_location:unknown')
})

test('a missing/null locationId is marked unknown, same as an unrecognized one', () => {
  const map = buildLocationTenantMap(ENV)
  assert.equal(describeQuarantineReason(null, map), 'wrong_or_missing_location:unknown')
  assert.equal(describeQuarantineReason(undefined, map), 'wrong_or_missing_location:unknown')
})

test('an unset/empty env var never creates a matchable map entry', () => {
  const map = buildLocationTenantMap({ GHL_LOCATION_ID: '', GHL_MEDSPA_LOCATION_ID: undefined })
  assert.equal(Object.keys(map).length, 0)
  // An empty-string locationId must not match an unset/empty-string env var.
  assert.equal(describeQuarantineReason('', map), 'wrong_or_missing_location:unknown')
})
