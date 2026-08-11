import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const routePath = new URL('../../app/api/leads/road-trip/route.ts', import.meta.url)

test('road-trip API is fixed to the shared Exotiq tenant and accepts no tenant input', async () => {
  const source = await readFile(routePath, 'utf8')

  assert.match(source, /export async function GET\(\)/)
  assert.match(source, /\.eq\('tenant_id', DEMO_TENANT_ID\)/)
  assert.doesNotMatch(source, /searchParams|parseQuery|requiredTenantIdQuerySchema/)
  assert.doesNotMatch(source, /const EXOTIQ_TENANT_ID|const UUID_RE/)
})
