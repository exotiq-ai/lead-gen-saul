-- Operational partner intake only; no compensation rules or agreement content.
BEGIN;
CREATE TABLE IF NOT EXISTS public.sales_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.tenants(id),
 email text NOT NULL CHECK(email=lower(btrim(email))), display_name text NOT NULL,
 team text NOT NULL DEFAULT 'starr' CHECK(team='starr'), active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(tenant_id='00000000-0000-0000-0000-000000000001'), UNIQUE(tenant_id,email), UNIQUE(id,tenant_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS leads_id_tenant_registry ON public.leads(id,tenant_id);
CREATE TABLE IF NOT EXISTS public.sales_registrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 request_id uuid NOT NULL, submitted_by_user_id uuid NOT NULL, submitted_by_member_id uuid,
 submitted_by_name text NOT NULL, submitted_at timestamptz NOT NULL DEFAULT now(),
 company_name text NOT NULL, contact_name text, email text, phone text, website text, relationship_note text,
 submitted_payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','declined')),
 match_kind text NOT NULL DEFAULT 'none' CHECK(match_kind IN('none','existing','submission','possible')),
 candidate_lead_ids uuid[] NOT NULL DEFAULT '{}', candidate_registration_ids uuid[] NOT NULL DEFAULT '{}',
 lead_id uuid, reviewed_at timestamptz, reviewed_by_user_id uuid, decision_reason text,
 CHECK(tenant_id='00000000-0000-0000-0000-000000000001'),
 UNIQUE(tenant_id,submitted_by_user_id,request_id), UNIQUE(id,tenant_id),
 FOREIGN KEY(submitted_by_member_id,tenant_id) REFERENCES public.sales_members(id,tenant_id),
 FOREIGN KEY(lead_id,tenant_id) REFERENCES public.leads(id,tenant_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS sales_one_accepted_registration ON public.sales_registrations(tenant_id,lead_id) WHERE status='accepted' AND lead_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.sales_account_assignments (
 lead_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, assigned_member_id uuid,
 next_action text, next_action_due_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(tenant_id='00000000-0000-0000-0000-000000000001'),
 FOREIGN KEY(lead_id,tenant_id) REFERENCES public.leads(id,tenant_id),
 FOREIGN KEY(assigned_member_id,tenant_id) REFERENCES public.sales_members(id,tenant_id)
);
ALTER TABLE public.sales_account_assignments ADD COLUMN IF NOT EXISTS ownership_overridden boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS public.sales_registration_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
 registration_id uuid, lead_id uuid, member_id uuid, actor_user_id uuid NOT NULL,
 event_type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(tenant_id='00000000-0000-0000-0000-000000000001'),
 FOREIGN KEY(registration_id,tenant_id) REFERENCES public.sales_registrations(id,tenant_id),
 FOREIGN KEY(lead_id,tenant_id) REFERENCES public.leads(id,tenant_id),
 FOREIGN KEY(member_id,tenant_id) REFERENCES public.sales_members(id,tenant_id)
);
CREATE TABLE IF NOT EXISTS public.sales_baseline_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 captured_at timestamptz NOT NULL, lead_count integer NOT NULL CHECK(lead_count>=0),
 exception_count integer NOT NULL CHECK(exception_count>=0), manifest_sha256 text NOT NULL CHECK(manifest_sha256~'^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,manifest_sha256),UNIQUE(id,tenant_id),
 CHECK(tenant_id='00000000-0000-0000-0000-000000000001')
);
CREATE TABLE IF NOT EXISTS public.sales_baseline_accounts (
 snapshot_id uuid NOT NULL, tenant_id uuid NOT NULL, lead_id uuid NOT NULL,
 original_source text, original_assigned_to text, source_review_required boolean NOT NULL DEFAULT false,
 PRIMARY KEY(snapshot_id,lead_id),
 FOREIGN KEY(snapshot_id,tenant_id) REFERENCES public.sales_baseline_snapshots(id,tenant_id),
 FOREIGN KEY(lead_id,tenant_id) REFERENCES public.leads(id,tenant_id),
 CHECK(tenant_id='00000000-0000-0000-0000-000000000001')
);
CREATE INDEX IF NOT EXISTS sales_registration_queue ON public.sales_registrations(tenant_id,status,submitted_at,id);
CREATE INDEX IF NOT EXISTS sales_member_accounts ON public.sales_account_assignments(tenant_id,assigned_member_id);
CREATE INDEX IF NOT EXISTS sales_receipt_events ON public.sales_registration_events(registration_id,created_at,id);

CREATE OR REPLACE FUNCTION public.sales_immutable_event() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Append-only history is immutable'; END $$;
DROP TRIGGER IF EXISTS sales_events_immutable ON public.sales_registration_events;
CREATE TRIGGER sales_events_immutable BEFORE UPDATE OR DELETE ON public.sales_registration_events FOR EACH ROW EXECUTE FUNCTION public.sales_immutable_event();
DROP TRIGGER IF EXISTS sales_baseline_immutable ON public.sales_baseline_accounts;
CREATE TRIGGER sales_baseline_immutable BEFORE UPDATE OR DELETE ON public.sales_baseline_accounts FOR EACH ROW EXECUTE FUNCTION public.sales_immutable_event();

CREATE OR REPLACE FUNCTION public.sales_assert_actor(p_actor jsonb, p_admin boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF p_actor->>'tenantId' IS DISTINCT FROM '00000000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'Exotiq tenant required'; END IF;
 IF nullif(p_actor->>'userId','') IS NULL OR nullif(p_actor->>'email','') IS NULL THEN RAISE EXCEPTION 'Authenticated actor required'; END IF;
 IF p_admin AND NOT coalesce((p_actor->>'isAdmin')::boolean,false) THEN RAISE EXCEPTION 'Admin role required'; END IF;
 IF NOT coalesce((p_actor->>'isAdmin')::boolean,false) AND NOT EXISTS(
  SELECT 1 FROM sales_members WHERE id=(p_actor->>'memberId')::uuid AND tenant_id=(p_actor->>'tenantId')::uuid
   AND active AND email=lower(p_actor->>'email')
 ) THEN RAISE EXCEPTION 'Active member required'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.sales_domain(v text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT nullif(lower(regexp_replace(split_part(split_part(split_part(regexp_replace(btrim(coalesce(v,'')), '^https?://', '', 'i'), '/', 1),'?',1),'#',1),'^www\.|:[0-9]+$|\.$','','gi')),'')
$$;
CREATE OR REPLACE FUNCTION public.sales_phone(v text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN length(d)=11 AND left(d,1)='1' THEN substring(d from 2) ELSE nullif(d,'') END FROM (SELECT regexp_replace(coalesce(v,''),'[^0-9]','','g') d) q
$$;
CREATE OR REPLACE FUNCTION public.sales_name(v text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(regexp_replace(coalesce(v,''),'[^a-zA-Z0-9]','','g')) $$;

CREATE OR REPLACE FUNCTION public.sales_member_write(p_actor jsonb,p_member_id uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE m sales_members; t uuid := (p_actor->>'tenantId')::uuid;
BEGIN
 PERFORM sales_assert_actor(p_actor,true);
 IF p_member_id IS NULL THEN
  IF nullif(btrim(p_input->>'display_name'),'') IS NULL OR (p_input->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR p_input->>'team' IS DISTINCT FROM 'starr' THEN RAISE EXCEPTION 'Valid member details required'; END IF;
  INSERT INTO sales_members(tenant_id,email,display_name,team) VALUES(t,lower(btrim(p_input->>'email')),btrim(p_input->>'display_name'),'starr') RETURNING * INTO m;
 ELSE
  IF NOT(p_input ? 'active') OR jsonb_typeof(p_input->'active')<>'boolean' THEN RAISE EXCEPTION 'Active flag required'; END IF;
  UPDATE sales_members SET active=(p_input->>'active')::boolean,updated_at=clock_timestamp() WHERE id=p_member_id AND tenant_id=t RETURNING * INTO m;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
 END IF;
 INSERT INTO sales_registration_events(tenant_id,member_id,actor_user_id,event_type,payload)
 VALUES(t,m.id,(p_actor->>'userId')::uuid,CASE WHEN p_member_id IS NULL THEN 'member_added' ELSE 'member_access_changed' END,jsonb_build_object('active',m.active));
 RETURN to_jsonb(m);
END $$;

CREATE OR REPLACE FUNCTION public.sales_submit(p_actor jsonb,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE t uuid := (p_actor->>'tenantId')::uuid; r sales_registrations; ids uuid[]; similar_ids uuid[]; pending_ids uuid[]; kind text;
BEGIN
 PERFORM sales_assert_actor(p_actor);
 IF nullif(btrim(p_input->>'company_name'),'') IS NULL OR coalesce(nullif(btrim(p_input->>'email'),''),nullif(btrim(p_input->>'phone'),''),nullif(btrim(p_input->>'website'),'')) IS NULL THEN RAISE EXCEPTION 'Business name and contact method required'; END IF;
 IF nullif(p_actor->>'memberId','') IS NULL THEN RAISE EXCEPTION 'Use an approved rep member login for partner submissions'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sales-registry:'||t,0));
 SELECT * INTO r FROM sales_registrations WHERE tenant_id=t AND submitted_by_user_id=(p_actor->>'userId')::uuid AND request_id=(p_input->>'request_id')::uuid;
 IF FOUND THEN
  IF r.submitted_payload<>p_input THEN RAISE EXCEPTION 'Request replay payload differs'; END IF;
  RETURN to_jsonb(r);
 END IF;
 SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO ids FROM leads WHERE tenant_id=t AND (
  (nullif(lower(p_input->>'email'),'') IS NOT NULL AND lower(email)=lower(p_input->>'email')) OR
  (sales_phone(p_input->>'phone') IS NOT NULL AND sales_phone(phone)=sales_phone(p_input->>'phone')) OR
  (sales_domain(p_input->>'website') IS NOT NULL AND sales_domain(company_domain)=sales_domain(p_input->>'website')));
 SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO similar_ids FROM leads WHERE tenant_id=t AND sales_name(company_name)=sales_name(p_input->>'company_name');
 SELECT coalesce(array_agg(id ORDER BY submitted_at,id),'{}') INTO pending_ids FROM sales_registrations WHERE tenant_id=t AND status IN('pending','accepted') AND (
  (nullif(lower(p_input->>'email'),'') IS NOT NULL AND lower(email)=lower(p_input->>'email')) OR
  (sales_phone(p_input->>'phone') IS NOT NULL AND sales_phone(phone)=sales_phone(p_input->>'phone')) OR
  (sales_domain(p_input->>'website') IS NOT NULL AND sales_domain(website)=sales_domain(p_input->>'website')) OR sales_name(company_name)=sales_name(p_input->>'company_name'));
 kind:=CASE WHEN cardinality(ids)>0 THEN 'existing' WHEN cardinality(pending_ids)>0 THEN 'submission' WHEN cardinality(similar_ids)>0 THEN 'possible' ELSE 'none' END;
 INSERT INTO sales_registrations(tenant_id,request_id,submitted_by_user_id,submitted_by_member_id,submitted_by_name,
 company_name,contact_name,email,phone,website,relationship_note,submitted_payload,match_kind,candidate_lead_ids,candidate_registration_ids)
 VALUES(t,(p_input->>'request_id')::uuid,(p_actor->>'userId')::uuid,(p_actor->>'memberId')::uuid,p_actor->>'displayName',
 btrim(p_input->>'company_name'),nullif(p_input->>'contact_name',''),nullif(lower(p_input->>'email'),''),nullif(p_input->>'phone',''),nullif(p_input->>'website',''),nullif(p_input->>'relationship_note',''),p_input,kind,CASE WHEN cardinality(ids)>0 THEN ids ELSE similar_ids END,pending_ids) RETURNING * INTO r;
 INSERT INTO sales_registration_events(tenant_id,registration_id,actor_user_id,event_type,payload) VALUES(t,r.id,(p_actor->>'userId')::uuid,'submitted',jsonb_build_object('match_kind',kind));
 RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.sales_review(p_actor jsonb,p_registration_id uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE t uuid := (p_actor->>'tenantId')::uuid; r sales_registrations; target uuid; candidates uuid[]; chosen_member uuid; prior_member uuid; original_owner text;
BEGIN
 PERFORM sales_assert_actor(p_actor,true);
 IF p_input->>'decision' NOT IN('accepted','declined') OR length(btrim(coalesce(p_input->>'reason','')))<3 THEN RAISE EXCEPTION 'Decision and reason required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sales-registry:'||t,0));
 SELECT * INTO r FROM sales_registrations WHERE id=p_registration_id AND tenant_id=t FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found'; END IF;
 IF r.status<>'pending' THEN
  IF r.status=p_input->>'decision' AND r.decision_reason=p_input->>'reason' AND r.reviewed_by_user_id=(p_actor->>'userId')::uuid THEN RETURN to_jsonb(r); END IF;
  RAISE EXCEPTION 'Submission already reviewed; history cannot be overwritten';
 END IF;
 IF p_input->>'decision'='accepted' THEN
  -- Also serialize against ordinary importer INSERTs that do not use our advisory key.
  LOCK TABLE public.leads IN SHARE ROW EXCLUSIVE MODE;
  SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO candidates FROM leads WHERE tenant_id=t AND (
    (r.email IS NOT NULL AND lower(email)=r.email) OR (sales_phone(r.phone) IS NOT NULL AND sales_phone(phone)=sales_phone(r.phone)) OR
    (sales_domain(r.website) IS NOT NULL AND sales_domain(company_domain)=sales_domain(r.website)) OR sales_name(company_name)=sales_name(r.company_name));
  target:=nullif(p_input->>'lead_id','')::uuid;
  IF cardinality(candidates)>0 AND (target IS NULL OR NOT(target=ANY(candidates))) THEN
   IF target IS NULL AND coalesce((p_input->>'confirmed_distinct')::boolean,false) AND NOT EXISTS(
    SELECT 1 FROM leads WHERE tenant_id=t AND ((r.email IS NOT NULL AND lower(email)=r.email) OR
     (sales_phone(r.phone) IS NOT NULL AND sales_phone(phone)=sales_phone(r.phone)) OR
     (sales_domain(r.website) IS NOT NULL AND sales_domain(company_domain)=sales_domain(r.website)))
   ) THEN NULL; ELSE RAISE EXCEPTION 'Existing match requires explicit account selection'; END IF;
  END IF;
  IF target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM leads WHERE id=target AND tenant_id=t) THEN RAISE EXCEPTION 'Account not found in Exotiq'; END IF;
  IF target IS NOT NULL AND EXISTS(SELECT 1 FROM sales_registrations WHERE tenant_id=t AND lead_id=target AND status='accepted') THEN RAISE EXCEPTION 'Account already has an accepted registration'; END IF;
  IF EXISTS(SELECT 1 FROM sales_registrations s WHERE s.tenant_id=t AND s.id<>r.id AND s.status='pending' AND (s.submitted_at,s.id)<(r.submitted_at,r.id) AND (
   (r.email IS NOT NULL AND s.email=r.email) OR (sales_phone(r.phone) IS NOT NULL AND sales_phone(s.phone)=sales_phone(r.phone)) OR
   (sales_domain(r.website) IS NOT NULL AND sales_domain(s.website)=sales_domain(r.website)) OR
   (NOT coalesce((p_input->>'confirmed_distinct')::boolean,false) AND sales_name(s.company_name)=sales_name(r.company_name)))) THEN RAISE EXCEPTION 'Earlier matching submission needs review first'; END IF;
  chosen_member:=coalesce(nullif(p_input->>'assigned_member_id','')::uuid,r.submitted_by_member_id);
  IF chosen_member IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sales_members WHERE id=chosen_member AND tenant_id=t AND active) THEN RAISE EXCEPTION 'Active assigned member required'; END IF;
  IF target IS NULL THEN
   INSERT INTO leads(tenant_id,company_name,first_name,email,phone,company_domain,source,source_detail,status,assigned_to)
   VALUES(t,r.company_name,r.contact_name,r.email,r.phone,sales_domain(r.website),'partner_submission','registration:'||r.id,'new',CASE WHEN chosen_member IS NOT NULL THEN 'team' ELSE NULL END) RETURNING id INTO target;
   INSERT INTO sales_account_assignments(tenant_id,lead_id,assigned_member_id,ownership_overridden) VALUES(t,target,chosen_member,true);
  ELSE
   SELECT assigned_to INTO original_owner FROM leads WHERE id=target;
   SELECT assigned_member_id INTO prior_member FROM sales_account_assignments WHERE lead_id=target AND tenant_id=t;
   -- Acceptance never silently steals an existing operational owner.
   IF chosen_member IS NOT NULL AND original_owner IS NULL AND prior_member IS NULL THEN
    INSERT INTO sales_account_assignments(tenant_id,lead_id,assigned_member_id,ownership_overridden) VALUES(t,target,chosen_member,true)
    ON CONFLICT(lead_id) DO UPDATE SET assigned_member_id=EXCLUDED.assigned_member_id,ownership_overridden=true,updated_at=clock_timestamp();
   END IF;
  END IF;
 END IF;
 UPDATE sales_registrations SET status=p_input->>'decision',lead_id=target,reviewed_at=clock_timestamp(),reviewed_by_user_id=(p_actor->>'userId')::uuid,decision_reason=p_input->>'reason'
 WHERE id=r.id RETURNING * INTO r;
 INSERT INTO sales_registration_events(tenant_id,registration_id,lead_id,actor_user_id,event_type,payload)
 VALUES(t,r.id,target,(p_actor->>'userId')::uuid,'reviewed',jsonb_build_object('status',r.status,'reason',r.decision_reason,'confirmed_distinct',coalesce((p_input->>'confirmed_distinct')::boolean,false)));
 RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.sales_update_account(p_actor jsonb,p_lead_id uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE t uuid := (p_actor->>'tenantId')::uuid; a sales_account_assignments; previous_member uuid; next_member uuid; current_legacy text;
BEGIN
 PERFORM sales_assert_actor(p_actor);
 IF p_input ? 'assigned_member_id' AND NOT coalesce((p_actor->>'isAdmin')::boolean,false) THEN RAISE EXCEPTION 'Admin role required for assignment'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sales-registry:'||t,0));
 SELECT assigned_to INTO current_legacy FROM leads WHERE id=p_lead_id AND tenant_id=t;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account not found in Exotiq'; END IF;
 SELECT * INTO a FROM sales_account_assignments WHERE lead_id=p_lead_id AND tenant_id=t FOR UPDATE;
 IF NOT coalesce((p_actor->>'isAdmin')::boolean,false) AND (a.assigned_member_id IS NULL OR a.assigned_member_id IS DISTINCT FROM (p_actor->>'memberId')::uuid) THEN RAISE EXCEPTION 'Account is not assigned to this member'; END IF;
 previous_member:=a.assigned_member_id;next_member:=previous_member;
 IF p_input ? 'assigned_member_id' THEN
  IF length(btrim(coalesce(p_input->>'reason','')))<3 THEN RAISE EXCEPTION 'Assignment reason required'; END IF;
  next_member:=nullif(p_input->>'assigned_member_id','')::uuid;
  IF next_member IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sales_members WHERE id=next_member AND tenant_id=t AND active) THEN RAISE EXCEPTION 'Active assigned member required'; END IF;
 END IF;
 INSERT INTO sales_account_assignments(tenant_id,lead_id,assigned_member_id,ownership_overridden,next_action,next_action_due_at)
 VALUES(t,p_lead_id,next_member,coalesce(a.ownership_overridden,false) OR (p_input ? 'assigned_member_id'),CASE WHEN p_input ? 'next_action' THEN nullif(p_input->>'next_action','') ELSE a.next_action END,
 CASE WHEN p_input ? 'next_action_due_at' THEN nullif(p_input->>'next_action_due_at','')::timestamptz ELSE a.next_action_due_at END)
 ON CONFLICT(lead_id) DO UPDATE SET assigned_member_id=EXCLUDED.assigned_member_id,ownership_overridden=EXCLUDED.ownership_overridden,next_action=EXCLUDED.next_action,next_action_due_at=EXCLUDED.next_action_due_at,updated_at=clock_timestamp() RETURNING * INTO a;
 INSERT INTO sales_registration_events(tenant_id,lead_id,actor_user_id,event_type,payload)
 VALUES(t,p_lead_id,(p_actor->>'userId')::uuid,CASE WHEN p_input ? 'assigned_member_id' THEN 'account_handoff' ELSE 'account_update' END,
 jsonb_build_object('previous_member_id',previous_member,'assigned_member_id',next_member,'legacy_owner_preserved',current_legacy,'next_action',a.next_action,'next_action_due_at',a.next_action_due_at,'note',p_input->>'outcome_note','reason',p_input->>'reason'));
 RETURN to_jsonb(a);
END $$;

CREATE OR REPLACE FUNCTION public.sales_import_baseline(p_summary jsonb,p_accounts jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE t uuid := (p_summary->>'tenant_id')::uuid; s sales_baseline_snapshots; expected integer := (p_summary->>'lead_count')::integer; flags integer;
BEGIN
 IF t IS DISTINCT FROM '00000000-0000-0000-0000-000000000001'::uuid THEN RAISE EXCEPTION 'Exotiq tenant required'; END IF;
 IF jsonb_typeof(p_accounts) IS DISTINCT FROM 'array' OR jsonb_array_length(p_accounts)<>expected THEN RAISE EXCEPTION 'Baseline coverage count mismatch'; END IF;
 IF (SELECT count(DISTINCT x->>'lead_id') FROM jsonb_array_elements(p_accounts) x)<>expected THEN RAISE EXCEPTION 'Duplicate baseline IDs'; END IF;
 SELECT count(*) INTO flags FROM jsonb_array_elements(p_accounts) x WHERE coalesce((x->>'source_review_required')::boolean,false);
 IF flags<>(p_summary->>'exception_count')::integer THEN RAISE EXCEPTION 'Baseline review count mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_accounts) x WHERE NOT EXISTS(SELECT 1 FROM leads WHERE id=(x->>'lead_id')::uuid AND tenant_id=t)) THEN RAISE EXCEPTION 'Baseline contains an unknown or foreign account'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sales-registry:'||t,0));
 SELECT * INTO s FROM sales_baseline_snapshots WHERE tenant_id=t AND manifest_sha256=p_summary->>'manifest_sha256';
 IF FOUND THEN
  IF s.lead_count<>expected OR s.exception_count<>flags OR s.captured_at<>(p_summary->>'captured_at')::timestamptz OR EXISTS(
   SELECT 1 FROM jsonb_array_elements(p_accounts) x LEFT JOIN sales_baseline_accounts b ON b.snapshot_id=s.id AND b.lead_id=(x->>'lead_id')::uuid
   WHERE b.lead_id IS NULL OR b.original_source IS DISTINCT FROM x->>'original_source' OR b.original_assigned_to IS DISTINCT FROM x->>'original_assigned_to' OR b.source_review_required IS DISTINCT FROM coalesce((x->>'source_review_required')::boolean,false)
  ) THEN RAISE EXCEPTION 'Baseline replay differs from immutable snapshot'; END IF;
  RETURN to_jsonb(s);
 END IF;
 INSERT INTO sales_baseline_snapshots(tenant_id,captured_at,lead_count,exception_count,manifest_sha256)
 VALUES(t,(p_summary->>'captured_at')::timestamptz,expected,flags,p_summary->>'manifest_sha256') RETURNING * INTO s;
 INSERT INTO sales_baseline_accounts(snapshot_id,tenant_id,lead_id,original_source,original_assigned_to,source_review_required)
 SELECT s.id,t,(x->>'lead_id')::uuid,x->>'original_source',x->>'original_assigned_to',coalesce((x->>'source_review_required')::boolean,false) FROM jsonb_array_elements(p_accounts) x;
 RETURN to_jsonb(s);
END $$;
DROP TRIGGER IF EXISTS sales_baseline_snapshot_immutable ON public.sales_baseline_snapshots;
CREATE TRIGGER sales_baseline_snapshot_immutable BEFORE UPDATE OR DELETE ON public.sales_baseline_snapshots FOR EACH ROW EXECUTE FUNCTION public.sales_immutable_event();

CREATE OR REPLACE FUNCTION public.sales_guard_legacy_owner() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.tenant_id='00000000-0000-0000-0000-000000000001' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
  IF EXISTS(SELECT 1 FROM sales_account_assignments WHERE tenant_id=OLD.tenant_id AND lead_id=OLD.id AND ownership_overridden) THEN
   RAISE EXCEPTION 'Use Team and Intake for an explicit registry account handoff';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sales_guard_legacy_owner ON public.leads;
CREATE TRIGGER sales_guard_legacy_owner BEFORE UPDATE OF assigned_to ON public.leads FOR EACH ROW EXECUTE FUNCTION public.sales_guard_legacy_owner();

DO $$ DECLARE name text; f record; BEGIN
 FOREACH name IN ARRAY ARRAY['sales_members','sales_registrations','sales_registration_events','sales_account_assignments','sales_baseline_snapshots','sales_baseline_accounts'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',name);
  EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role',name);
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname LIKE 'sales\_%' ESCAPE '\' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
