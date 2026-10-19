import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
test('Next route does not expose a non-route runtime export',()=>{
 const s=readFileSync(new URL('../../app/api/dashboard/pipeline-detail/route.ts',import.meta.url),'utf8')
 assert.doesNotMatch(s,/export async function fetchPipelineDetail/)
 assert.match(s,/export async function GET/)
})
