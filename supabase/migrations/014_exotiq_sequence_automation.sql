-- API-first Exotiq multichannel sequence orchestration.
-- GHL remains the CRM/task/conversation mirror; Supabase owns deterministic timing and idempotency.
BEGIN;

CREATE TABLE IF NOT EXISTS outreach_sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  campaign_version_id UUID REFERENCES outreach_campaign_versions(id) ON DELETE RESTRICT,
  sequence_key TEXT NOT NULL,
  sequence_version INTEGER NOT NULL CHECK (sequence_version > 0),
  mode TEXT NOT NULL CHECK (mode IN ('demo','live')),
  batch_key TEXT NOT NULL,
  route TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','exited','failed','cancelled')),
  current_step INTEGER NOT NULL DEFAULT 0,
  next_action_at TIMESTAMPTZ,
  ghl_contact_id TEXT,
  exit_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, lead_id, sequence_key, sequence_version, batch_key)
);

CREATE TABLE IF NOT EXISTS outreach_sequence_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES outreach_sequence_enrollments(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  queue_id UUID REFERENCES outreach_queue(id) ON DELETE SET NULL,
  step_key TEXT NOT NULL,
  step_ordinal INTEGER NOT NULL CHECK (step_ordinal > 0),
  action_kind TEXT NOT NULL CHECK (action_kind IN ('email','call_task','instagram_task')),
  label TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','skipped','failed','cancelled')),
  idempotency_key TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider TEXT,
  provider_action_id TEXT,
  error_detail TEXT,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_due
  ON outreach_sequence_enrollments (tenant_id, status, next_action_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sequence_actions_due
  ON outreach_sequence_actions (tenant_id, status, due_at)
  WHERE status = 'pending';

ALTER TABLE outreach_sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_sequence_actions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_outreach_sequence_enrollments_updated ON outreach_sequence_enrollments;
    CREATE TRIGGER trg_outreach_sequence_enrollments_updated BEFORE UPDATE ON outreach_sequence_enrollments
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    DROP TRIGGER IF EXISTS trg_outreach_sequence_actions_updated ON outreach_sequence_actions;
    CREATE TRIGGER trg_outreach_sequence_actions_updated BEFORE UPDATE ON outreach_sequence_actions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

COMMIT;
