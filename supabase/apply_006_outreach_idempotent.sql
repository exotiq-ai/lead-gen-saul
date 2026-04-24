-- 006 — Outreach (IDEMPOTENT)
-- Use this on a database that ALREADY has 001–005 applied.
-- Safe to run more than once. Requires set_updated_at() from 003_scoring_functions.sql.
-- If you see: syntax error near "REATE" — see top comment in 006_outreach_schema.sql

SELECT 1;

-- ── Tables ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outreach_sequences (
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

CREATE TABLE IF NOT EXISTS outreach_queue (
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

CREATE INDEX IF NOT EXISTS idx_outreach_queue_tenant_status ON outreach_queue (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_outreach_queue_lead ON outreach_queue (lead_id);

-- ── Triggers (replace if re-run) ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_outreach_queue_updated ON outreach_queue;
CREATE TRIGGER trg_outreach_queue_updated
  BEFORE UPDATE ON outreach_queue
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_outreach_sequences_updated ON outreach_sequences;
CREATE TRIGGER trg_outreach_sequences_updated
  BEFORE UPDATE ON outreach_sequences
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE outreach_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_outreach_sequences" ON outreach_sequences;
CREATE POLICY "tenant_isolation_outreach_sequences" ON outreach_sequences
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

DROP POLICY IF EXISTS "tenant_isolation_outreach_queue" ON outreach_queue;
CREATE POLICY "tenant_isolation_outreach_queue" ON outreach_queue
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
