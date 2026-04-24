-- 001_core_schema.sql

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}',
  branding JSONB DEFAULT '{}',
  ghl_location_id TEXT,
  ghl_api_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE icp_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  criteria JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  position INT NOT NULL,
  color TEXT,
  is_terminal BOOLEAN DEFAULT false,
  terminal_type TEXT CHECK (terminal_type IN ('won', 'lost', NULL)),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  linkedin_url TEXT,
  company_name TEXT,
  company_domain TEXT,
  company_industry TEXT,
  company_size TEXT,
  company_revenue TEXT,
  company_location TEXT,
  stage_id UUID REFERENCES pipeline_stages(id),
  source TEXT NOT NULL,
  source_detail TEXT,
  score INT DEFAULT 0,
  score_breakdown JSONB DEFAULT '{}',
  icp_fit_score INT DEFAULT 0,
  engagement_score INT DEFAULT 0,
  red_flags JSONB DEFAULT '[]',
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'enriching', 'scored', 'outreach', 'engaged', 'qualified', 'converted', 'lost', 'disqualified')),
  assigned_to TEXT CHECK (assigned_to IN ('gregory', 'team', NULL)),
  ghl_contact_id TEXT,
  ghl_last_sync TIMESTAMPTZ,
  first_contacted_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  channel TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  request_data JSONB DEFAULT '{}',
  response_data JSONB DEFAULT '{}',
  cost_cents INT DEFAULT 0,
  tokens_used INT DEFAULT 0,
  error_message TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  input_data JSONB DEFAULT '{}',
  output_data JSONB DEFAULT '{}',
  decisions JSONB DEFAULT '[]',
  leads_processed INT DEFAULT 0,
  tokens_used INT DEFAULT 0,
  cost_cents INT DEFAULT 0,
  duration_ms INT,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_run_id UUID REFERENCES agent_runs(id),
  model TEXT NOT NULL,
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  total_tokens INT GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  cost_cents INT DEFAULT 0,
  purpose TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE scoring_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  previous_score INT,
  new_score INT,
  score_breakdown JSONB DEFAULT '{}',
  reason TEXT,
  scored_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conversion_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('won', 'lost')),
  revenue_cents INT,
  loss_reason TEXT,
  time_to_conversion_days INT,
  source TEXT,
  icp_fit_at_conversion INT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
