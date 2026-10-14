import assert from 'node:assert/strict'
import test from 'node:test'
import { TENANTS, resolveTenantId, UNRESOLVED_TENANT_ID, parseTenantCatalog } from './catalog'

test('catalog validation accepts the live seeded shape and rejects corrupt metadata', () => {
  assert.deepEqual(parseTenantCatalog({ tenants: TENANTS }), { tenants: TENANTS })
  for (const payload of [null, {}, { tenants: [] }, { tenants: 'bad' }, { tenants: [null] }, { tenants: [{}] }, { tenants: [TENANTS[0], TENANTS[0]] }, { tenants: [{ ...TENANTS[0], slug: 'bad&tenant=exotiq' }] }]) {
    assert.throws(() => parseTenantCatalog(payload), /Invalid tenant catalog/)
  }
})

for (const tenant of TENANTS) {
  for (const value of [tenant.slug, tenant.id]) {
    test(`${value} wins over a different persisted tenant even before catalog load`, () => {
      assert.equal(resolveTenantId(value, 'exotiq', []), tenant.id)
      assert.equal(resolveTenantId(value, 'medspa-boulder', TENANTS), tenant.id)
    })
  }
  test(`persisted ${tenant.slug} resolves without a URL parameter`, () => {
    assert.equal(resolveTenantId(null, tenant.id, []), tenant.id)
    assert.equal(resolveTenantId(null, tenant.slug, []), tenant.id)
  })
}

test('unknown explicit selection never falls back to the stored/default tenant', () => {
  for (const param of ['', 'missing', '33333333-3333-4333-8333-333333333333']) {
    assert.equal(resolveTenantId(param, TENANTS[0].id, TENANTS), UNRESOLVED_TENANT_ID)
  }
})

test('DB-only tenants resolve by slug or UUID once the catalog arrives', () => {
  const added = { id: '33333333-3333-4333-8333-333333333333', slug: 'new-service', name: 'New Service', icon: '🏢' }
  for (const value of [added.slug, added.id]) {
    assert.equal(resolveTenantId(value, null, TENANTS), UNRESOLVED_TENANT_ID)
    assert.equal(resolveTenantId(value, TENANTS[0].id, [...TENANTS, added]), added.id)
  }
})

test('only an absent URL and absent persisted selection choose the default', () => {
  assert.equal(resolveTenantId(null, null, TENANTS), TENANTS[0].id)
  assert.equal(resolveTenantId(null, 'missing', TENANTS), UNRESOLVED_TENANT_ID)
})
