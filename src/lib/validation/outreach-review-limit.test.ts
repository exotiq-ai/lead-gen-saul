import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { outreachQueueQuerySchema } from './schemas'

test('current full copy-review batch can be read without the old 500-row cutoff', () => {
  const result = outreachQueueQuerySchema.safeParse({tenant_id:'00000000-0000-0000-0000-000000000001',status:'pending',limit:1000})
  assert.equal(result.success,true)
})
test('queue reader still enforces a bounded maximum', () => {
  assert.equal(outreachQueueQuerySchema.safeParse({limit:1001}).success,false)
})
test('outreach UI asks for the supported full-batch bound and does not call pending drafts approved', () => {
  const source=readFileSync(new URL('../../app/dashboard/outreach/OutreachPageClient.tsx',import.meta.url),'utf8')
  assert.ok(source.includes('limit=1000'))
  assert.ok(!source.includes('Pending is mostly empty'))
})
