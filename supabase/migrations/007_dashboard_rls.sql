-- Grant read-only access to the 'anon' role for the Exotiq tenant.
-- This allows the public-facing dashboard to display data.

-- IMPORTANT: This policy assumes the demo tenant is the Exotiq tenant.
-- In a real multi-tenant setup, this would be more dynamic.
CREATE POLICY "anon_read_exotiq_tenant" ON tenants
  FOR SELECT TO anon
  USING (id = '00000000-0000-0000-0000-000000000001');

CREATE POLICY "anon_read_exotiq_leads" ON leads
  FOR SELECT TO anon
  USING (tenant_id = '00000000-0000-0000-0000-000000000001');

CREATE POLICY "anon_read_exotiq_pipeline" ON pipeline_stages
  FOR SELECT TO anon
  USING (tenant_id = '00000000-0000-0000-0000-000000000001');

CREATE POLICY "anon_read_exotiq_activities" ON lead_activities
  FOR SELECT TO anon
  USING (tenant_id = '00000000-0000-0000-0000-000000000001');

CREATE POLICY "anon_read_exotiq_outreach" ON outreach_queue
  FOR SELECT TO anon
  USING (tenant_id = '00000000-0000-0000-0000-000000000001');

-- Add other tables as needed for different dashboard views...
CREATE POLICY "anon_read_exotiq_icp" ON icp_profiles
  FOR SELECT TO anon
  USING (tenant_id = '00000000-0000-0000-0000-000000000001');

CREATE POLICY "anon_read_exotiq_agent_runs" ON agent_runs
  FOR SELECT TO anon
  USING (tenant_id = '00000000-0000-0000-0000-000000000001');
