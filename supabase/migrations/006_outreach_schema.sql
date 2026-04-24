-- 006_outreach_schema.sql
-- If Supabase says: syntax error near "REATE" — the word CREATE lost its leading C when pasting.
-- Fix: re-paste the whole file from the repo, or type C at the start of CREATE TABLE.

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
