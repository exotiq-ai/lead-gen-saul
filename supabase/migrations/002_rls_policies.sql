-- 002_rls_policies.sql

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrichments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE icp_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversion_feedback ENABLE ROW LEVEL SECURITY;

-- Tenant isolation: all policies use auth.jwt() -> 'tenant_id' claim
-- Service role bypasses RLS for all agent operations

CREATE POLICY "tenant_isolation_leads" ON leads
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "tenant_isolation_lead_activities" ON lead_activities
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "tenant_isolation_enrichments" ON enrichments
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "tenant_isolation_agent_runs" ON agent_runs
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "tenant_isolation_token_usage" ON token_usage
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "tenant_isolation_icp_profiles" ON icp_profiles
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "tenant_isolation_pipeline_stages" ON pipeline_stages
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "tenant_isolation_scoring_history" ON scoring_history
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "tenant_isolation_conversion_feedback" ON conversion_feedback
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- Tenants table: users can only see their own tenant
CREATE POLICY "tenant_self_read" ON tenants
  FOR SELECT USING (id = (auth.jwt() ->> 'tenant_id')::UUID);
