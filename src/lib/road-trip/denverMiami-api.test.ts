import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Denver–Miami reads only persisted Exotiq trip evidence with no mutations or tenant input', async () => {
  const route = await readFile(new URL('../../app/api/leads/road-trip/denver-miami/route.ts', import.meta.url), 'utf8')
  assert.match(route, /export async function GET\(\)/)
  assert.match(route, /\.eq\('tenant_id', DEMO_TENANT_ID\)/)
  assert.match(route, /\.eq\('score_breakdown->road_trip_2026->>trip_id', TRIP_ID\)/)
  assert.match(route, /'Cache-Control': 'private, no-store'/)
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/)
  const proxy = await readFile(new URL('../../proxy.ts', import.meta.url), 'utf8')
  assert.match(proxy, /'\/api\/leads'/)
})
