-- =============================================================================
-- FULL BOOTSTRAP ONLY — for an EMPTY database (no `tenants` table yet).
-- If your Supabase project already has tables, DO NOT run this file; you will
-- get: ERROR 42P07: relation "tenants" already exists
-- For Phase 2 outreach on an existing DB, run instead:
--   supabase/apply_006_outreach_idempotent.sql
-- See: supabase/MIGRATIONS.md
-- =============================================================================

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
-- 003_scoring_functions.sql

-- Generic lead scoring function
-- Reads component scores from score_breakdown JSONB and computes a weighted total.
-- Updates leads.score, leads.icp_fit_score, leads.assigned_to, and inserts a scoring_history row.
CREATE OR REPLACE FUNCTION calculate_lead_score(p_lead_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead           leads%ROWTYPE;
  v_breakdown      JSONB;
  v_icp_score      INT := 0;
  v_engagement     INT := 0;
  v_total          INT := 0;
  v_previous_score INT;
BEGIN
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead % not found', p_lead_id;
  END IF;

  v_breakdown := COALESCE(v_lead.score_breakdown, '{}');

  -- ICP fit components (0–100 each, blended into icp_fit_score)
  v_icp_score := LEAST(100, GREATEST(0,
    COALESCE((v_breakdown ->> 'company_size_fit')::INT,    0) +
    COALESCE((v_breakdown ->> 'industry_fit')::INT,        0) +
    COALESCE((v_breakdown ->> 'location_fit')::INT,        0) +
    COALESCE((v_breakdown ->> 'revenue_fit')::INT,         0)
  ));

  -- Engagement components
  v_engagement := LEAST(100, GREATEST(0,
    COALESCE((v_breakdown ->> 'email_opens')::INT,         0) +
    COALESCE((v_breakdown ->> 'reply_signal')::INT,        0) +
    COALESCE((v_breakdown ->> 'meeting_booked')::INT,      0) +
    COALESCE((v_breakdown ->> 'link_clicked')::INT,        0)
  ));

  -- Weighted composite: 70% ICP fit, 30% engagement
  v_total := ROUND(v_icp_score * 0.70 + v_engagement * 0.30)::INT;

  v_previous_score := v_lead.score;

  UPDATE leads
  SET
    score            = v_total,
    icp_fit_score    = v_icp_score,
    engagement_score = v_engagement,
    assigned_to      = CASE WHEN v_total >= 80 THEN 'gregory' ELSE 'team' END,
    updated_at       = NOW()
  WHERE id = p_lead_id;

  INSERT INTO scoring_history (
    tenant_id, lead_id, previous_score, new_score,
    score_breakdown, reason, scored_by
  ) VALUES (
    v_lead.tenant_id, p_lead_id, v_previous_score, v_total,
    v_breakdown, 'Automated re-score', 'system'
  );

  RETURN v_total;
END;
$$;


-- Exotiq-specific scoring function
-- Weights: fleet_size 35%, vehicle_quality 20%, market_tier 15%,
--          operational_signals 20%, online_presence 10%
-- Fleet size tier mapping (raw value from score_breakdown->>'fleet_size'):
--   >= 20  -> tier 5 (100 pts)
--   10–19  -> tier 4  (80 pts)
--   5–9    -> tier 3  (60 pts)
--   2–4    -> tier 2  (40 pts)
--   1      -> tier 1  (20 pts)
--   0 / missing -> tier 0 (0 pts)
CREATE OR REPLACE FUNCTION calculate_exotiq_score(p_lead_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead              leads%ROWTYPE;
  v_breakdown         JSONB;
  v_fleet_raw         INT;
  v_fleet_pts         INT;
  v_vehicle_quality   INT;
  v_market_tier       INT;
  v_operational       INT;
  v_online_presence   INT;
  v_total             INT;
  v_previous_score    INT;
BEGIN
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead % not found', p_lead_id;
  END IF;

  v_breakdown := COALESCE(v_lead.score_breakdown, '{}');

  -- Fleet size: raw count -> tiered points (35% weight, scale to 0–100)
  v_fleet_raw := COALESCE((v_breakdown ->> 'fleet_size')::INT, 0);
  v_fleet_pts := CASE
    WHEN v_fleet_raw >= 20 THEN 100
    WHEN v_fleet_raw >= 10 THEN 80
    WHEN v_fleet_raw >= 5  THEN 60
    WHEN v_fleet_raw >= 2  THEN 40
    WHEN v_fleet_raw = 1   THEN 20
    ELSE 0
  END;

  -- Vehicle quality: expected 0–100 component score
  v_vehicle_quality := LEAST(100, GREATEST(0,
    COALESCE((v_breakdown ->> 'vehicle_quality')::INT, 0)
  ));

  -- Market tier: expected 0–100 component score
  v_market_tier := LEAST(100, GREATEST(0,
    COALESCE((v_breakdown ->> 'market_tier')::INT, 0)
  ));

  -- Operational signals: expected 0–100 component score
  v_operational := LEAST(100, GREATEST(0,
    COALESCE((v_breakdown ->> 'operational_signals')::INT, 0)
  ));

  -- Online presence: expected 0–100 component score
  v_online_presence := LEAST(100, GREATEST(0,
    COALESCE((v_breakdown ->> 'online_presence')::INT, 0)
  ));

  -- Weighted composite
  v_total := ROUND(
    v_fleet_pts       * 0.35 +
    v_vehicle_quality * 0.20 +
    v_market_tier     * 0.15 +
    v_operational     * 0.20 +
    v_online_presence * 0.10
  )::INT;

  v_previous_score := v_lead.score;

  UPDATE leads
  SET
    score         = v_total,
    icp_fit_score = v_total,
    assigned_to   = CASE WHEN v_total >= 80 THEN 'gregory' ELSE 'team' END,
    updated_at    = NOW()
  WHERE id = p_lead_id;

  INSERT INTO scoring_history (
    tenant_id, lead_id, previous_score, new_score,
    score_breakdown, reason, scored_by
  ) VALUES (
    v_lead.tenant_id, p_lead_id, v_previous_score, v_total,
    jsonb_build_object(
      'fleet_size',          v_fleet_pts,
      'fleet_size_raw',      v_fleet_raw,
      'vehicle_quality',     v_vehicle_quality,
      'market_tier',         v_market_tier,
      'operational_signals', v_operational,
      'online_presence',     v_online_presence
    ),
    'Exotiq automated score', 'exotiq_scorer'
  );

  RETURN v_total;
END;
$$;


-- Trigger: auto-update updated_at on leads
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_icp_profiles_updated_at
  BEFORE UPDATE ON icp_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- 004_views_and_indexes.sql

-- ─────────────────────────────────────────
-- VIEWS
-- ─────────────────────────────────────────

-- Pipeline summary: lead counts and avg score per stage per tenant
CREATE OR REPLACE VIEW pipeline_summary AS
SELECT
  l.tenant_id,
  ps.id               AS stage_id,
  ps.name             AS stage_name,
  ps.slug             AS stage_slug,
  ps.position,
  ps.color,
  ps.is_terminal,
  ps.terminal_type,
  COUNT(l.id)         AS lead_count,
  AVG(l.score)        AS avg_score,
  SUM(CASE WHEN l.assigned_to = 'gregory' THEN 1 ELSE 0 END) AS gregory_count,
  SUM(CASE WHEN l.assigned_to = 'team'    THEN 1 ELSE 0 END) AS team_count
FROM pipeline_stages ps
LEFT JOIN leads l
  ON l.stage_id   = ps.id
 AND l.tenant_id  = ps.tenant_id
GROUP BY
  l.tenant_id, ps.id, ps.name, ps.slug,
  ps.position, ps.color, ps.is_terminal, ps.terminal_type;


-- Daily lead volume: new leads per day per source per tenant
CREATE OR REPLACE VIEW lead_volume_daily AS
SELECT
  tenant_id,
  DATE_TRUNC('day', created_at)::DATE AS day,
  source,
  COUNT(*)                             AS lead_count,
  AVG(score)                           AS avg_score,
  SUM(CASE WHEN status = 'converted'  THEN 1 ELSE 0 END) AS conversions
FROM leads
GROUP BY
  tenant_id,
  DATE_TRUNC('day', created_at)::DATE,
  source;


-- Source attribution: conversion rate and revenue by acquisition source
CREATE OR REPLACE VIEW source_attribution AS
SELECT
  l.tenant_id,
  l.source,
  COUNT(DISTINCT l.id)                                          AS total_leads,
  COUNT(DISTINCT CASE WHEN l.status = 'converted' THEN l.id END) AS converted_leads,
  ROUND(
    COUNT(DISTINCT CASE WHEN l.status = 'converted' THEN l.id END)::NUMERIC
    / NULLIF(COUNT(DISTINCT l.id), 0) * 100, 2
  )                                                             AS conversion_rate_pct,
  COALESCE(SUM(cf.revenue_cents), 0)                           AS total_revenue_cents,
  AVG(cf.time_to_conversion_days)                              AS avg_days_to_convert,
  AVG(l.score)                                                  AS avg_lead_score
FROM leads l
LEFT JOIN conversion_feedback cf
  ON cf.lead_id   = l.id
 AND cf.outcome   = 'won'
GROUP BY l.tenant_id, l.source;


-- Lead aging: how long leads have been in current stage without activity
CREATE OR REPLACE VIEW lead_aging AS
SELECT
  l.tenant_id,
  l.id                                                      AS lead_id,
  l.first_name,
  l.last_name,
  l.company_name,
  l.status,
  l.score,
  l.assigned_to,
  ps.name                                                   AS stage_name,
  l.created_at,
  l.last_activity_at,
  NOW() - COALESCE(l.last_activity_at, l.created_at)       AS time_since_activity,
  EXTRACT(EPOCH FROM (NOW() - COALESCE(l.last_activity_at, l.created_at)))
    / 86400                                                  AS days_since_activity,
  CASE
    WHEN NOW() - COALESCE(l.last_activity_at, l.created_at) > INTERVAL '30 days' THEN 'stale'
    WHEN NOW() - COALESCE(l.last_activity_at, l.created_at) > INTERVAL '14 days' THEN 'aging'
    WHEN NOW() - COALESCE(l.last_activity_at, l.created_at) > INTERVAL '7 days'  THEN 'cooling'
    ELSE 'active'
  END                                                       AS aging_status
FROM leads l
LEFT JOIN pipeline_stages ps ON ps.id = l.stage_id
WHERE l.status NOT IN ('converted', 'lost', 'disqualified');


-- ─────────────────────────────────────────
-- PERFORMANCE INDEXES
-- ─────────────────────────────────────────

-- Leads: core lookup patterns
CREATE INDEX IF NOT EXISTS idx_leads_tenant_id       ON leads (tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_status   ON leads (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_score    ON leads (tenant_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_stage_id        ON leads (stage_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to     ON leads (tenant_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_source          ON leads (tenant_id, source);
CREATE INDEX IF NOT EXISTS idx_leads_created_at      ON leads (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_last_activity   ON leads (tenant_id, last_activity_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_leads_ghl_contact     ON leads (ghl_contact_id) WHERE ghl_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_email           ON leads (email)          WHERE email IS NOT NULL;

-- Lead activities
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id    ON lead_activities (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_tenant_id  ON lead_activities (tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_type       ON lead_activities (tenant_id, activity_type);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created_at ON lead_activities (lead_id, created_at DESC);

-- Enrichments
CREATE INDEX IF NOT EXISTS idx_enrichments_lead_id   ON enrichments (lead_id);
CREATE INDEX IF NOT EXISTS idx_enrichments_tenant_id ON enrichments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_enrichments_provider  ON enrichments (tenant_id, provider);
CREATE INDEX IF NOT EXISTS idx_enrichments_status    ON enrichments (tenant_id, status);

-- Agent runs
CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant_id   ON agent_runs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_type        ON agent_runs (tenant_id, agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status      ON agent_runs (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_started_at  ON agent_runs (tenant_id, started_at DESC);

-- Token usage
CREATE INDEX IF NOT EXISTS idx_token_usage_tenant_id     ON token_usage (tenant_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_agent_run_id  ON token_usage (agent_run_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_created_at    ON token_usage (tenant_id, created_at DESC);

-- Scoring history
CREATE INDEX IF NOT EXISTS idx_scoring_history_lead_id ON scoring_history (lead_id);
CREATE INDEX IF NOT EXISTS idx_scoring_history_tenant  ON scoring_history (tenant_id, created_at DESC);

-- Conversion feedback
CREATE INDEX IF NOT EXISTS idx_conversion_feedback_lead_id ON conversion_feedback (lead_id);
CREATE INDEX IF NOT EXISTS idx_conversion_feedback_outcome ON conversion_feedback (tenant_id, outcome);

-- ICP profiles
CREATE INDEX IF NOT EXISTS idx_icp_profiles_tenant_active ON icp_profiles (tenant_id, is_active);

-- Pipeline stages
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_tenant ON pipeline_stages (tenant_id, position);

-- JSONB GIN indexes for fast key lookups
CREATE INDEX IF NOT EXISTS idx_leads_score_breakdown     ON leads USING GIN (score_breakdown);
CREATE INDEX IF NOT EXISTS idx_leads_red_flags           ON leads USING GIN (red_flags);
CREATE INDEX IF NOT EXISTS idx_enrichments_response_data ON enrichments USING GIN (response_data);
CREATE INDEX IF NOT EXISTS idx_agent_runs_decisions      ON agent_runs USING GIN (decisions);
-- 005_enrichment_tables.sql
-- Adds saul_web provider support to the enrichments system.

-- ─────────────────────────────────────────
-- 1. Extend enrichments.provider CHECK constraint to allow 'saul_web'
--    Drop the existing implicit constraint (if any) and add an explicit one.
-- ─────────────────────────────────────────

-- Add a named CHECK constraint for provider values so it can be extended cleanly.
-- We use ALTER TABLE ADD CONSTRAINT; this will fail gracefully if the same name
-- already exists — run idempotently via DO block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'enrichments_provider_check'
      AND conrelid = 'enrichments'::regclass
  ) THEN
    ALTER TABLE enrichments
      ADD CONSTRAINT enrichments_provider_check
      CHECK (provider IN (
        'apollo',
        'hunter',
        'clearbit',
        'linkedin',
        'openai',
        'perplexity',
        'saul_web',
        'manual'
      ));
  END IF;
END;
$$;


-- ─────────────────────────────────────────
-- 2. Additional tracking columns for enrichment quality
-- ─────────────────────────────────────────

ALTER TABLE enrichments
  ADD COLUMN IF NOT EXISTS confidence_score    NUMERIC(5,2),   -- 0.00–100.00 provider confidence
  ADD COLUMN IF NOT EXISTS source_url          TEXT,           -- URL actually scraped / queried
  ADD COLUMN IF NOT EXISTS raw_html_hash       TEXT,           -- SHA-256 of raw page (dedup)
  ADD COLUMN IF NOT EXISTS retry_count         INT DEFAULT 0,  -- how many times we retried
  ADD COLUMN IF NOT EXISTS next_retry_at       TIMESTAMPTZ;    -- scheduled retry for failed jobs


-- ─────────────────────────────────────────
-- 3. parse_saul_web_enrichment helper function
--    Extracts well-known saul_web fields from response_data JSONB.
--    Returns a JSONB object of normalized, typed values.
--
--    Expected response_data keys (all optional):
--      ig_followers_approx        INT
--      turo_listed                BOOLEAN
--      has_booking_flow           BOOLEAN
--      google_review_count_approx INT
--      named_owner                TEXT
--      vehicle_quality_detected   TEXT   ('luxury'|'premium'|'standard'|'economy')
--      fleet_size_estimate_low    INT
--      fleet_size_estimate_high   INT
--      experience_only_risk       BOOLEAN  -- fleet is experiential, not daily-rental
-- ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION parse_saul_web_enrichment(response_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_ig_followers      INT;
  v_turo_listed       BOOLEAN;
  v_has_booking_flow  BOOLEAN;
  v_review_count      INT;
  v_named_owner       TEXT;
  v_vehicle_quality   TEXT;
  v_fleet_low         INT;
  v_fleet_high        INT;
  v_experience_risk   BOOLEAN;
  v_fleet_mid         NUMERIC;
  v_online_score      INT;
  v_quality_score     INT;
BEGIN
  -- Extract raw values with safe casts
  v_ig_followers     := (response_data ->> 'ig_followers_approx')::INT;
  v_turo_listed      := (response_data ->> 'turo_listed')::BOOLEAN;
  v_has_booking_flow := (response_data ->> 'has_booking_flow')::BOOLEAN;
  v_review_count     := (response_data ->> 'google_review_count_approx')::INT;
  v_named_owner      := response_data ->> 'named_owner';
  v_vehicle_quality  := response_data ->> 'vehicle_quality_detected';
  v_fleet_low        := (response_data ->> 'fleet_size_estimate_low')::INT;
  v_fleet_high       := (response_data ->> 'fleet_size_estimate_high')::INT;
  v_experience_risk  := (response_data ->> 'experience_only_risk')::BOOLEAN;

  -- Derive midpoint fleet estimate
  v_fleet_mid := CASE
    WHEN v_fleet_low IS NOT NULL AND v_fleet_high IS NOT NULL
      THEN (v_fleet_low + v_fleet_high) / 2.0
    WHEN v_fleet_low IS NOT NULL  THEN v_fleet_low::NUMERIC
    WHEN v_fleet_high IS NOT NULL THEN v_fleet_high::NUMERIC
    ELSE NULL
  END;

  -- Online presence score (0–100) derived from IG followers + reviews + booking flow
  v_online_score := LEAST(100, GREATEST(0,
    CASE WHEN v_ig_followers IS NOT NULL THEN
      CASE
        WHEN v_ig_followers >= 50000 THEN 40
        WHEN v_ig_followers >= 10000 THEN 30
        WHEN v_ig_followers >= 2000  THEN 20
        WHEN v_ig_followers >= 500   THEN 10
        ELSE 5
      END
    ELSE 0 END
    +
    CASE WHEN v_review_count IS NOT NULL THEN
      CASE
        WHEN v_review_count >= 200 THEN 30
        WHEN v_review_count >= 50  THEN 20
        WHEN v_review_count >= 10  THEN 10
        ELSE 5
      END
    ELSE 0 END
    +
    CASE WHEN v_has_booking_flow = true THEN 20 ELSE 0 END
    +
    CASE WHEN v_turo_listed      = true THEN 10 ELSE 0 END
  ));

  -- Vehicle quality score (0–100)
  v_quality_score := CASE v_vehicle_quality
    WHEN 'luxury'   THEN 100
    WHEN 'premium'  THEN 75
    WHEN 'standard' THEN 40
    WHEN 'economy'  THEN 15
    ELSE 0
  END;

  RETURN jsonb_build_object(
    -- Raw extracted fields
    'ig_followers_approx',        v_ig_followers,
    'turo_listed',                v_turo_listed,
    'has_booking_flow',           v_has_booking_flow,
    'google_review_count_approx', v_review_count,
    'named_owner',                v_named_owner,
    'vehicle_quality_detected',   v_vehicle_quality,
    'fleet_size_estimate_low',    v_fleet_low,
    'fleet_size_estimate_high',   v_fleet_high,
    'experience_only_risk',       v_experience_risk,

    -- Derived / normalized fields
    'fleet_size_midpoint',        v_fleet_mid,
    'online_presence_score',      v_online_score,
    'vehicle_quality_score',      v_quality_score,

    -- Red-flag signals
    'red_flags', jsonb_build_array(
      CASE WHEN v_experience_risk = true        THEN 'experience_only_fleet'      ELSE NULL END,
      CASE WHEN v_fleet_high IS NOT NULL
               AND v_fleet_high < 2            THEN 'single_car_operator'        ELSE NULL END,
      CASE WHEN v_turo_listed = false
               AND v_has_booking_flow = false  THEN 'no_rental_platform_presence' ELSE NULL END
    ) - 'null'::JSONB  -- removes NULL elements from array
  );
END;
$$;


-- ─────────────────────────────────────────
-- 4. Convenience view: latest saul_web enrichment per lead
-- ─────────────────────────────────────────

CREATE OR REPLACE VIEW saul_web_enrichments AS
SELECT DISTINCT ON (e.lead_id)
  e.id                                                AS enrichment_id,
  e.tenant_id,
  e.lead_id,
  e.status,
  e.confidence_score,
  e.source_url,
  e.requested_at,
  e.completed_at,
  parse_saul_web_enrichment(e.response_data)          AS parsed,
  e.response_data                                     AS raw_response
FROM enrichments e
WHERE e.provider = 'saul_web'
  AND e.status   = 'completed'
ORDER BY e.lead_id, e.completed_at DESC;


-- Index to speed up provider-specific queries
CREATE INDEX IF NOT EXISTS idx_enrichments_saul_web
  ON enrichments (lead_id, completed_at DESC)
  WHERE provider = 'saul_web' AND status = 'completed';

-- 006 (appended from migrations/006_outreach_schema.sql)
-- 006_outreach_schema.sql
-- If Supabase says: syntax error near "REATE" — the word CREATE lost its leading C when pasting.

SELECT 1;

CREATE TABLE outreach_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE outreach_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  sequence_id UUID REFERENCES outreach_sequences(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('instagram_dm', 'email', 'phone', 'sms', 'linkedin_dm')),
  message_draft TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'sent', 'rejected')),
  generated_by TEXT,
  reviewed_by TEXT,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_outreach_queue_tenant_status ON outreach_queue (tenant_id, status);
CREATE INDEX idx_outreach_queue_lead ON outreach_queue (lead_id);

CREATE TRIGGER trg_outreach_queue_updated
  BEFORE UPDATE ON outreach_queue
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_outreach_sequences_updated
  BEFORE UPDATE ON outreach_sequences
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE outreach_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_outreach_sequences" ON outreach_sequences
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "tenant_isolation_outreach_queue" ON outreach_queue
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
