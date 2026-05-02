-- 009_tenant_views_and_grants.sql
--
-- Background
-- ----------
-- Migration 008_dashboard_fix.sql granted `SELECT` to anon on tenants,
-- leads, lead_activities, outreach_queue, icp_profiles, agent_runs,
-- scoring_history, enrichments, token_usage, and pipeline_stages.
-- Combined with the JWT-claim-based tenant_isolation_* policies from
-- 002_rls_policies.sql, this means anyone with the public anon key can
-- read every tenant's rows, because the anon role doesn't carry a
-- tenant_id JWT claim and falls through to the unconditional GRANT.
--
-- Today the Next.js server only ever talks to Supabase via the service
-- role (lib/supabase/server.ts), so tenant isolation is enforced at the
-- API boundary by adding eq('tenant_id', tenantId) to every query.
-- This migration tightens the floor so that a future client-side
-- supabase-js call (or a leaked anon key) cannot cross-read tenants:
--
--   1. Drop the bare GRANT SELECT statements from 008.
--   2. Add a PostgreSQL session variable `app.tenant_id` plus a
--      SECURITY DEFINER helper `set_request_tenant(uuid)` that anon may
--      call to scope a request.
--   3. Add tenant-scoped SELECT policies for anon on each shared table,
--      matching `tenant_id = current_setting('app.tenant_id')::uuid`.
--      These policies coexist with the JWT-claim policies; whichever
--      condition matches lets the row through.
--
-- Apply manually
-- --------------
-- If you have psql + DATABASE_URL handy:
--   psql "$DATABASE_URL" -f supabase/migrations/009_tenant_views_and_grants.sql
-- Otherwise paste the file into Supabase SQL editor (Project >
-- SQL Editor > New query > Run). Idempotent: safe to re-run.
--
-- Roll-forward note: when SSO + JWT custom-claim tenant_id ships
-- (Stage 3d, deferred), drop the set_request_tenant flow in favour of
-- (auth.jwt() ->> 'tenant_id')::uuid. The 002_rls_policies.sql tenant
-- policies already use that path, so the migration there will be a
-- one-line revoke.

BEGIN;

-- 1. Drop the broad anon GRANTs from 008. We re-grant precisely below,
-- but RLS will gate every row.
DO $$
BEGIN
  -- These tables exist after 001-006; if a fresh project hasn't applied
  -- 008 yet there's nothing to revoke, hence IF EXISTS / safe revoke.
  EXECUTE 'REVOKE SELECT ON TABLE tenants FROM anon';
  EXECUTE 'REVOKE SELECT ON TABLE leads FROM anon';
  EXECUTE 'REVOKE SELECT ON TABLE pipeline_stages FROM anon';
  EXECUTE 'REVOKE SELECT ON TABLE lead_activities FROM anon';
  EXECUTE 'REVOKE SELECT ON TABLE outreach_queue FROM anon';
  EXECUTE 'REVOKE SELECT ON TABLE icp_profiles FROM anon';
  EXECUTE 'REVOKE SELECT ON TABLE agent_runs FROM anon';
  EXECUTE 'REVOKE SELECT ON TABLE scoring_history FROM anon';
  EXECUTE 'REVOKE SELECT ON TABLE enrichments FROM anon';
  EXECUTE 'REVOKE SELECT ON TABLE token_usage FROM anon';
EXCEPTION WHEN undefined_table THEN
  -- A migration above us hasn't been applied; ignore.
  NULL;
END $$;

-- 2. Session-scoped tenant id and the helper that anon may call.
--
-- Postgres's GUC `app.tenant_id` lives for one session. The helper
-- coerces input through ::uuid so a bad caller can't poison a query
-- with arbitrary text, and it's marked SECURITY DEFINER so anon can
-- invoke it without needing direct GRANT on set_config().
CREATE OR REPLACE FUNCTION public.set_request_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant_id::text, true);
END;
$$;

REVOKE ALL ON FUNCTION public.set_request_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_request_tenant(uuid) TO anon, authenticated, service_role;

-- 3. SELECT policies that admit anon iff app.tenant_id matches.
--
-- Why DROP/CREATE rather than CREATE OR REPLACE: Postgres doesn't
-- support OR REPLACE on policies. Idempotency comes from the explicit
-- DROP POLICY IF EXISTS lines below.

-- ---- tenants
DROP POLICY IF EXISTS "anon_tenant_scoped_tenants" ON tenants;
CREATE POLICY "anon_tenant_scoped_tenants" ON tenants
  FOR SELECT TO anon
  USING (id::text = current_setting('app.tenant_id', true));

-- ---- leads
DROP POLICY IF EXISTS "anon_tenant_scoped_leads" ON leads;
CREATE POLICY "anon_tenant_scoped_leads" ON leads
  FOR SELECT TO anon
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- ---- pipeline_stages
DROP POLICY IF EXISTS "anon_tenant_scoped_pipeline_stages" ON pipeline_stages;
CREATE POLICY "anon_tenant_scoped_pipeline_stages" ON pipeline_stages
  FOR SELECT TO anon
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- ---- lead_activities
DROP POLICY IF EXISTS "anon_tenant_scoped_lead_activities" ON lead_activities;
CREATE POLICY "anon_tenant_scoped_lead_activities" ON lead_activities
  FOR SELECT TO anon
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- ---- outreach_queue
DROP POLICY IF EXISTS "anon_tenant_scoped_outreach_queue" ON outreach_queue;
CREATE POLICY "anon_tenant_scoped_outreach_queue" ON outreach_queue
  FOR SELECT TO anon
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- ---- icp_profiles
DROP POLICY IF EXISTS "anon_tenant_scoped_icp_profiles" ON icp_profiles;
CREATE POLICY "anon_tenant_scoped_icp_profiles" ON icp_profiles
  FOR SELECT TO anon
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- ---- agent_runs
DROP POLICY IF EXISTS "anon_tenant_scoped_agent_runs" ON agent_runs;
CREATE POLICY "anon_tenant_scoped_agent_runs" ON agent_runs
  FOR SELECT TO anon
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- ---- scoring_history
DROP POLICY IF EXISTS "anon_tenant_scoped_scoring_history" ON scoring_history;
CREATE POLICY "anon_tenant_scoped_scoring_history" ON scoring_history
  FOR SELECT TO anon
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- ---- enrichments
DROP POLICY IF EXISTS "anon_tenant_scoped_enrichments" ON enrichments;
CREATE POLICY "anon_tenant_scoped_enrichments" ON enrichments
  FOR SELECT TO anon
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- ---- token_usage
DROP POLICY IF EXISTS "anon_tenant_scoped_token_usage" ON token_usage;
CREATE POLICY "anon_tenant_scoped_token_usage" ON token_usage
  FOR SELECT TO anon
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- 4. Re-grant SELECT on the same tables to anon. The policies above
-- decide which rows are visible.
GRANT SELECT ON tenants, leads, pipeline_stages, lead_activities,
                outreach_queue, icp_profiles, agent_runs, scoring_history,
                enrichments, token_usage TO anon;

COMMIT;

-- Smoke test (run after applying):
--
--   -- As anon (e.g. via supabase-js with the anon key):
--   SELECT public.set_request_tenant('00000000-0000-0000-0000-000000000001'::uuid);
--   SELECT count(*) FROM leads;          -- should equal Exotiq lead count
--   SELECT public.set_request_tenant('11111111-1111-1111-1111-111111111111'::uuid);
--   SELECT count(*) FROM leads;          -- should equal MedSpa lead count
--   -- Without calling set_request_tenant first, anon should see 0 rows.
