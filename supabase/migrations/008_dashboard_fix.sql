-- Drop all existing anon read policies to start fresh
DROP POLICY IF EXISTS "anon_read_exotiq_tenant" ON tenants;
DROP POLICY IF EXISTS "anon_read_exotiq_leads" ON leads;
DROP POLICY IF EXISTS "anon_read_exotiq_pipeline" ON pipeline_stages;
DROP POLICY IF EXISTS "anon_read_exotiq_activities" ON lead_activities;
DROP POLICY IF EXISTS "anon_read_exotiq_outreach" ON outreach_queue;
DROP POLICY IF EXISTS "anon_read_exotiq_icp" ON icp_profiles;
DROP POLICY IF EXISTS "anon_read_exotiq_agent_runs" ON agent_runs;

-- Grant broad SELECT access to the anon role.
-- In a production multi-tenant environment, this would be replaced by
-- a policy that checks for a tenant ID in the JWT, but for the
-- current Exotiq-only dashboard, this is the simplest effective solution.
GRANT SELECT ON tenants TO anon;
GRANT SELECT ON leads TO anon;
GRANT SELECT ON pipeline_stages TO anon;
GRANT SELECT ON lead_activities TO anon;
GRANT SELECT ON outreach_queue TO anon;
GRANT SELECT ON icp_profiles TO anon;
GRANT SELECT ON agent_runs TO anon;
GRANT SELECT ON scoring_history TO anon;
GRANT SELECT ON enrichments TO anon;
GRANT SELECT ON token_usage TO anon;
