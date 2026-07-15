-- Exotiq GTM safety foundation
-- Adds immutable campaign versions, send attempts, provider events,
-- suppressions, research evidence, and approved claims.

BEGIN;

CREATE TABLE IF NOT EXISTS outreach_campaign_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_key TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','active','paused','archived')),
  audience TEXT NOT NULL CHECK (audience IN ('operator','investor','partner','customer_success')),
  market_country TEXT NOT NULL DEFAULT 'US',
  offer TEXT NOT NULL,
  sender_name TEXT,
  sender_address TEXT,
  reply_to_address TEXT,
  physical_address TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, campaign_key, version)
);

CREATE TABLE IF NOT EXISTS approved_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  claim_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  approved_wording TEXT NOT NULL,
  basis TEXT NOT NULL,
  evidence_url TEXT,
  allowed_channels TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','expired','revoked')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  revalidate_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, claim_key, version)
);

CREATE TABLE IF NOT EXISTS lead_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL,
  structured_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_url TEXT NOT NULL,
  evidence_snippet TEXT,
  observed_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confidence TEXT NOT NULL CHECK (confidence IN ('CONFIRMED','ESTIMATED','INFERRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_evidence_lead ON lead_evidence (tenant_id, lead_id, fetched_at DESC);

CREATE TABLE IF NOT EXISTS outreach_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('email','phone','domain','lead','contact','global')),
  normalized_value TEXT NOT NULL,
  reason TEXT NOT NULL,
  source TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  actor TEXT,
  provider_event_id TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, scope, normalized_value)
);

CREATE INDEX IF NOT EXISTS idx_outreach_suppressions_active
  ON outreach_suppressions (tenant_id, scope, normalized_value)
  WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS outreach_send_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  queue_id UUID REFERENCES outreach_queue(id) ON DELETE SET NULL,
  campaign_version_id UUID REFERENCES outreach_campaign_versions(id) ON DELETE RESTRICT,
  sequence_step INTEGER NOT NULL DEFAULT 1 CHECK (sequence_step > 0),
  idempotency_key TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('dry_run','live')),
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('prepared','scheduled','attempting','provider_accepted','delivered','soft_bounced','hard_bounced','complained','unsubscribed','replied','failed','ambiguous','cancelled')),
  sender_name TEXT,
  sender_address TEXT,
  reply_to_address TEXT,
  subject TEXT,
  payload_hash TEXT,
  provider_message_id TEXT,
  error_code TEXT,
  error_detail TEXT,
  attempted_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_outreach_send_attempts_provider_message
  ON outreach_send_attempts (tenant_id, provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS outreach_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  send_attempt_id UUID REFERENCES outreach_send_attempts(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  provider_message_id TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','processed','quarantined','failed')),
  quarantine_reason TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE (tenant_id, provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_outreach_events_message
  ON outreach_events (tenant_id, provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

ALTER TABLE outreach_queue ADD COLUMN IF NOT EXISTS campaign_version_id UUID REFERENCES outreach_campaign_versions(id) ON DELETE SET NULL;
ALTER TABLE outreach_queue ADD COLUMN IF NOT EXISTS sequence_step INTEGER;
ALTER TABLE outreach_queue ADD COLUMN IF NOT EXISTS route TEXT;
ALTER TABLE outreach_queue ADD COLUMN IF NOT EXISTS eligibility_reason TEXT;
ALTER TABLE outreach_queue ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE outreach_queue ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_queue_idempotency
  ON outreach_queue (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_outreach_campaign_versions_updated ON outreach_campaign_versions;
    CREATE TRIGGER trg_outreach_campaign_versions_updated BEFORE UPDATE ON outreach_campaign_versions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    DROP TRIGGER IF EXISTS trg_approved_claims_updated ON approved_claims;
    CREATE TRIGGER trg_approved_claims_updated BEFORE UPDATE ON approved_claims
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    DROP TRIGGER IF EXISTS trg_outreach_suppressions_updated ON outreach_suppressions;
    CREATE TRIGGER trg_outreach_suppressions_updated BEFORE UPDATE ON outreach_suppressions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    DROP TRIGGER IF EXISTS trg_outreach_send_attempts_updated ON outreach_send_attempts;
    CREATE TRIGGER trg_outreach_send_attempts_updated BEFORE UPDATE ON outreach_send_attempts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

ALTER TABLE outreach_campaign_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE approved_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_send_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_events ENABLE ROW LEVEL SECURITY;

COMMIT;
