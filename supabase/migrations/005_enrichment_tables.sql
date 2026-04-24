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
