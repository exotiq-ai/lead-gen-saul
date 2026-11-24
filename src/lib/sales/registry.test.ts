import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
const root=process.cwd()
const migration=path.join(root,'supabase/migrations/015_partner_sales_registry.sql')
const tenant='00000000-0000-0000-0000-000000000001'
const admin={userId:'aaaaaaaa-0000-4000-8000-000000000001',email:'admin@example.test',displayName:'Admin',isAdmin:true,memberId:null,team:null,tenantId:tenant}

test('registry transactions enforce identity, immutable receipts, authorization and no duplicate accounts',async()=>{
 const db=new PGlite()
 try {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;')
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/001_core_schema.sql'),'utf8'))
  await db.query('INSERT INTO tenants(id,name,slug) VALUES($1,\'Fixture\',\'fixture\')',[tenant])
  if(fs.existsSync(migration))await db.exec(fs.readFileSync(migration,'utf8'))
  const check=await db.query<{exists:boolean}>("SELECT to_regprocedure('public.sales_submit(jsonb,jsonb)') IS NOT NULL AS exists")
  assert.equal(check.rows[0].exists,true,'atomic intake is not implemented')
  const normalized=await db.query<{domain:string}>("SELECT sales_domain('https://WWW.example.test:443#fleet') AS domain")
  assert.equal(normalized.rows[0].domain,'example.test')
  const rpc=async(name:string,args:unknown[])=> (await db.query<{result:Record<string,unknown>}>(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result
  const member=await rpc('sales_member_write',[admin,null,{email:'rep@example.test',display_name:'Rep',team:'starr'}])
  const rep={...admin,userId:'bbbbbbbb-0000-4000-8000-000000000001',email:'rep@example.test',displayName:'Rep',isAdmin:false,memberId:member.id,team:'starr'}
  const input={request_id:'cccccccc-0000-4000-8000-000000000001',company_name:'Synthetic One',email:'owner@synthetic-one.invalid',website:'https://www.synthetic-one.invalid/fleet'}
  const submitted=await rpc('sales_submit',[rep,input]);assert.equal(submitted.status,'pending');assert.equal(submitted.match_kind,'none')
  const replay=await rpc('sales_submit',[rep,input]);assert.equal(replay.id,submitted.id)
  await assert.rejects(()=>rpc('sales_submit',[rep,{...input,company_name:'Changed request'}]),/request|replay|idempot/i)
  assert.equal((await db.query('SELECT * FROM leads')).rows.length,0,'submission does not create a canonical prospect')
  await assert.rejects(()=>rpc('sales_review',[rep,submitted.id,{decision:'accepted',reason:'No permission'}]),/admin/i)
  const accepted=await rpc('sales_review',[admin,submitted.id,{decision:'accepted',reason:'Identity reviewed',assigned_member_id:member.id}]);assert.equal(accepted.status,'accepted');assert(accepted.lead_id)
  assert.equal((await db.query('SELECT * FROM leads')).rows.length,1)
  const dup=await rpc('sales_submit',[rep,{...input,request_id:'cccccccc-0000-4000-8000-000000000002',email:'OWNER@SYNTHETIC-ONE.INVALID',website:'synthetic-one.invalid'}]);assert.equal(dup.match_kind,'existing')
  await assert.rejects(()=>rpc('sales_review',[admin,dup.id,{decision:'accepted',reason:'Duplicate',lead_id:accepted.lead_id}]),/already|registered|accepted/i)
  await rpc('sales_review',[admin,dup.id,{decision:'declined',reason:'Existing submission retained'}])
  await assert.rejects(()=>db.query("UPDATE sales_registration_events SET event_type='rewritten'"),/immutable|append/i)
  await rpc('sales_update_account',[rep,accepted.lead_id,{next_action:'Call owner',outcome_note:'Left voicemail'}])
  const other=await rpc('sales_member_write',[admin,null,{email:'other@example.test',display_name:'Other',team:'starr'}])
  await assert.rejects(()=>rpc('sales_update_account',[{...rep,email:'other@example.test',memberId:other.id},accepted.lead_id,{next_action:'Steal'}]),/assigned|owner/i)
  await assert.rejects(()=>rpc('sales_update_account',[rep,accepted.lead_id,{assigned_member_id:other.id,reason:'Steal'}]),/admin/i)
  await assert.rejects(()=>db.query("UPDATE leads SET assigned_to='gregory' WHERE id=$1",[accepted.lead_id]),/handoff|Team|registry/i)
  await rpc('sales_update_account',[admin,accepted.lead_id,{assigned_member_id:other.id,reason:'Explicit handoff'}])
  const lead=await db.query<{source:string}>('SELECT source FROM leads WHERE id=$1',[accepted.lead_id]);assert.equal(lead.rows[0].source,'partner_submission')
  const original=await db.query<{submitted_by_member_id:string}>('SELECT submitted_by_member_id FROM sales_registrations WHERE id=$1',[submitted.id]);assert.equal(original.rows[0].submitted_by_member_id,member.id)
  await rpc('sales_member_write',[admin,other.id,{active:false}])
  await assert.rejects(()=>rpc('sales_submit',[{...rep,email:'other@example.test',memberId:other.id},{...input,request_id:'cccccccc-0000-4000-8000-000000000003'}]),/active|member/i)
  await assert.rejects(()=>rpc('sales_submit',[{...rep,tenantId:'22222222-2222-2222-2222-222222222222'},input]),/tenant|Exotiq/i)
  await assert.rejects(()=>rpc('sales_submit',[admin,{...input,request_id:'cccccccc-0000-4000-8000-000000000004'}]),/rep|member/i)
  const different=await rpc('sales_submit',[rep,{...input,request_id:'cccccccc-0000-4000-8000-000000000005',email:'owner@different-fleet.invalid',website:'different-fleet.invalid'}])
  assert(['possible','submission'].includes(String(different.match_kind)))
  const distinct=await rpc('sales_review',[admin,different.id,{decision:'accepted',reason:'Verified different business, same common name',confirmed_distinct:true}])
  assert.notEqual(distinct.lead_id,accepted.lead_id)
  const summary={tenant_id:tenant,captured_at:'2026-01-01T12:00:00Z',lead_count:2,exception_count:1,manifest_sha256:'a'.repeat(64)}
  const baseline=[{lead_id:accepted.lead_id,original_source:'partner_submission',original_assigned_to:'team',source_review_required:true},{lead_id:distinct.lead_id,original_source:'partner_submission',original_assigned_to:'team',source_review_required:false}]
  const exists=await db.query<{exists:boolean}>("SELECT to_regprocedure('public.sales_import_baseline(jsonb,jsonb)') IS NOT NULL AS exists")
  assert.equal(exists.rows[0].exists,true,'atomic baseline import is not implemented')
  await assert.rejects(()=>rpc('sales_import_baseline',[{...summary,lead_count:3},baseline]),/count|coverage/i)
  const snap=await rpc('sales_import_baseline',[summary,baseline]);assert.equal(snap.lead_count,2)
  const retry=await rpc('sales_import_baseline',[summary,baseline]);assert.equal(retry.id,snap.id)
  await assert.rejects(()=>rpc('sales_import_baseline',[summary,[{...baseline[0],original_source:'rewritten'},baseline[1]]]),/differ|immutable|mismatch/i)
  await assert.rejects(()=>db.query("UPDATE sales_baseline_snapshots SET exception_count=0"),/immutable|append/i)
  const founderId='eeeeeeee-0000-4000-8000-000000000001'
  await db.query("INSERT INTO leads(id,tenant_id,company_name,source,assigned_to) VALUES($1,$2,'Synthetic Founder Account','manual','gregory')",[founderId,tenant])
  const noted=await rpc('sales_update_account',[admin,founderId,{next_action:'Founder call'}]);assert.equal(noted.ownership_overridden,false)
  await db.query("UPDATE leads SET assigned_to='benjamin' WHERE id=$1",[founderId])
  const moved=await rpc('sales_update_account',[admin,founderId,{assigned_member_id:member.id,reason:'Explicit founder handoff'}]);assert.equal(moved.ownership_overridden,true)
  await assert.rejects(()=>db.query("UPDATE leads SET assigned_to='gregory' WHERE id=$1",[founderId]),/handoff|Team|registry/i)
  const privileges=await db.query<{allowed:boolean}>("SELECT has_function_privilege('anon','public.sales_submit(jsonb,jsonb)','EXECUTE') allowed")
  assert.equal(privileges.rows[0].allowed,false)
  const tables=await db.query<{allowed:boolean}>("SELECT has_table_privilege('authenticated','sales_registrations','SELECT') allowed");assert.equal(tables.rows[0].allowed,false)
  await db.exec(fs.readFileSync(migration,'utf8')) // repeatable migration
 } finally {await db.close()}
})
