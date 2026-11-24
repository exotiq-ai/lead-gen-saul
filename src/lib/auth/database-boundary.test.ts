import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('direct view/RPC privileges cannot bypass server sales access; service reads survive', async () => {
  // Real single-connection PostgreSQL/WASM fixture, not production or a concurrency test.
  const db = new PGlite()
  const sql = (name: string) => fs.readFileSync(path.join(process.cwd(), 'supabase/migrations', name), 'utf8')
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;`)
    for (const file of ['001_core_schema.sql','002_rls_policies.sql','003_scoring_functions.sql','004_views_and_indexes.sql']) await db.exec(sql(file))
    await db.exec(`CREATE FUNCTION public.set_request_tenant(uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT $$;
      GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
      INSERT INTO tenants(id,name,slug) VALUES('00000000-0000-0000-0000-000000000001','Fixture','fixture');
      INSERT INTO leads(tenant_id,company_name,source) VALUES('00000000-0000-0000-0000-000000000001','Synthetic Test Operator','test');`)
    await db.exec(sql('016_sales_direct_access_boundary.sql'))
    for (const role of ['anon','authenticated']) {
      for (const view of ['lead_aging','source_attribution','pipeline_summary','lead_volume_daily']) {
        const { rows } = await db.query<{allowed: boolean}>("SELECT has_table_privilege($1,$2,'SELECT') allowed", [role,view])
        assert.equal(rows[0].allowed, false, `${role} must not read ${view}`)
      }
      for (const name of ['calculate_lead_score','calculate_exotiq_score','set_request_tenant']) {
        const { rows } = await db.query<{allowed: boolean}>("SELECT has_function_privilege($1,p.oid,'EXECUTE') allowed FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname=$2", [role,name])
        assert(rows.length > 0)
        assert(rows.every(r => r.allowed === false), `${role} must not execute ${name}`)
      }
    }
    await db.exec('SET ROLE service_role')
    assert.equal((await db.query('SELECT * FROM lead_aging')).rows.length, 1)
    await db.exec('RESET ROLE')
    await db.exec(sql('016_sales_direct_access_boundary.sql'))
  } finally { await db.close() }
})
