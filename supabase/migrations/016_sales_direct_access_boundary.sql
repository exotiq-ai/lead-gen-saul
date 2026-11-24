-- Authenticated sales access is through explicitly scoped server endpoints.
-- Existing views run with their owner's rights and must not bypass that boundary.
-- No data mutations; service-side dashboard/agent reads remain available.
BEGIN;
DO $$
DECLARE target text; proc record;
BEGIN
  FOREACH target IN ARRAY ARRAY['lead_aging','source_attribution','pipeline_summary','lead_volume_daily'] LOOP
    IF to_regclass('public.' || target) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', target);
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', target);
    END IF;
  END LOOP;
  -- Legacy SECURITY DEFINER functions must not accept arbitrary browser callers.
  -- Trigger execution is unaffected; trusted agent calls use service_role.
  FOR proc IN SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'calculate_lead_score','calculate_exotiq_score','set_request_tenant','parse_saul_web_enrichment'
    ) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', proc.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', proc.signature);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
