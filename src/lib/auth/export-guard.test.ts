import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { NextRequest, NextResponse } from 'next/server'
test('export handler independently denies before data generation, fails closed, and preserves admin cookies',async()=>{
 assert(fs.existsSync('src/lib/auth/export-guard.ts'),'export route needs an independent guard')
 const {protectExport}=await import('./export-guard')
 for(const reason of ['not_authenticated','not_authorized']){
  let reached=false
  const handler=protectExport(async()=>{reached=true;return new Response('private')},async()=>({ok:false as const,reason}))
  for(const dataset of ['leads','outreach','enrichments','activities']){const r=await handler(new NextRequest('http://localhost/api/exports?dataset='+dataset));assert.equal(r.status,reason==='not_authenticated'?401:403);assert.equal(reached,false);assert.match(r.headers.get('cache-control')||'',/no-store/)}
 }
 let reached=false
 const failed=protectExport(async()=>{reached=true;return new Response('private')},async()=>{throw Error('provider failure')})
 assert.equal((await failed(new NextRequest('http://localhost/api/exports'))).status,503);assert.equal(reached,false)
 const admin=protectExport(async()=>new Response('CSV'),async(_req:NextRequest,res:NextResponse)=>{res.cookies.set('refreshed','safe-fixture');return {ok:true as const}})
 const response=await admin(new NextRequest('http://localhost/api/exports'));assert.equal(await response.text(),'CSV');assert.match(response.headers.get('set-cookie')||'',/refreshed/);assert.match(response.headers.get('cache-control')||'',/no-store/)
})
