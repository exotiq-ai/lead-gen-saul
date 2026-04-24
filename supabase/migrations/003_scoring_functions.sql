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
