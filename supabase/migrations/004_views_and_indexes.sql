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
