-- Migration 011: Agent Insights table
--
-- Stores AI-generated insights from the Python agent's nightly/periodic
-- analysis. Each insight is a self-contained action card surfaced in
-- the Daily Brief drawer. The agent writes; the dashboard reads.
--
-- Insight types:
--   reply_analysis    — AI scrubbed an inbound message, classified intent, suggested action
--   dead_lead         — AI diagnosed why a lead went cold + recommended next step
--   new_lead_assess   — AI first-impression scoring for freshly discovered leads
--   draft_quality     — AI reviewed outreach draft quality before human approval
--   daily_narrative   — AI-written 2-3 sentence summary of the day's pipeline health
--   opportunity       — AI spotted a pattern or timing signal worth acting on
--   risk_alert        — AI flagged a potential problem (competitor mention, negative signal)

BEGIN;

CREATE TABLE IF NOT EXISTS agent_insights (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  lead_id       uuid REFERENCES leads(id),

  -- Classification
  insight_type  text NOT NULL,
  priority      smallint NOT NULL DEFAULT 50,  -- 0=low, 50=normal, 100=urgent
  status        text NOT NULL DEFAULT 'active', -- active, dismissed, actioned, expired

  -- Content
  title         text NOT NULL,
  body          text NOT NULL,
  suggested_action text,        -- one-line CTA ("Send case study", "Re-engage via LinkedIn")
  action_type   text,           -- button behavior: approve_draft, re_engage, mark_dead, defer, view_thread
  action_payload jsonb,         -- data needed to execute the action (draft_id, channel, template, etc)

  -- Source context
  source_activity_id uuid REFERENCES lead_activities(id),
  source_data   jsonb,          -- raw context the AI used (message body snippet, score history, etc)
  confidence    smallint,       -- 0-100 AI confidence in this insight
  model_used    text,           -- which LLM generated this (gpt-4o-mini, claude-sonnet-4-20250514, etc)

  -- Lifecycle
  expires_at    timestamptz,    -- auto-expire stale insights (e.g. 48h for reply analysis)
  actioned_at   timestamptz,
  dismissed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for the brief API: active insights for a tenant, ordered by priority
CREATE INDEX idx_agent_insights_tenant_active
  ON agent_insights (tenant_id, status, priority DESC, created_at DESC)
  WHERE status = 'active';

-- Index for lead-scoped lookups (lead detail page)
CREATE INDEX idx_agent_insights_lead
  ON agent_insights (lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL;

-- RLS: service_role bypasses; anon gets tenant-scoped read
ALTER TABLE agent_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_insights" ON agent_insights;
CREATE POLICY "service_role_full_access_insights" ON agent_insights
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_tenant_scoped_insights" ON agent_insights;
CREATE POLICY "anon_tenant_scoped_insights" ON agent_insights
  FOR SELECT TO anon
  USING (tenant_id::text = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE ON agent_insights TO service_role;
GRANT SELECT ON agent_insights TO anon;

COMMIT;
