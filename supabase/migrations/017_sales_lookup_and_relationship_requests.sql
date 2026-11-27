-- Exotiq-only SDR workflow. Additive: preserve source registration and lead data.
BEGIN;
ALTER TABLE public.sales_account_assignments
 ADD COLUMN IF NOT EXISTS founder_assist text NOT NULL DEFAULT 'none' CHECK(founder_assist IN('none','requested','active')),
 ADD COLUMN IF NOT EXISTS next_action_owner text NOT NULL DEFAULT 'account_owner' CHECK(next_action_owner IN('account_owner','gregory','unassigned')),
 ADD COLUMN IF NOT EXISTS handoff_summary text,
 ADD COLUMN IF NOT EXISTS sales_outreach_hold boolean NOT NULL DEFAULT false;

CREATE TABLE public.sales_match_lookups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 member_id uuid NOT NULL, actor_user_id uuid NOT NULL, input jsonb NOT NULL,
 candidate_lead_ids uuid[] NOT NULL DEFAULT '{}', status text NOT NULL CHECK(status IN('no_match','possible_match','existing_review_required','already_working','request_pending')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '20 minutes',
 FOREIGN KEY(member_id,tenant_id) REFERENCES public.sales_members(id,tenant_id),
 CHECK(tenant_id='00000000-0000-0000-0000-000000000001')
);
CREATE INDEX sales_lookup_quota ON public.sales_match_lookups(member_id,created_at);
CREATE TABLE public.sales_relationship_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), request_id uuid NOT NULL,
 submitted_by_user_id uuid NOT NULL, submitted_by_member_id uuid NOT NULL, submitted_by_name text NOT NULL,
 company_name text NOT NULL, candidate_lead_ids uuid[] NOT NULL, lead_id uuid,
 contact_name text NOT NULL, relationship_note text NOT NULL, last_contact_at date, last_contact_summary text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','information_requested','approved','declined','withdrawn')),
 submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reviewed_at timestamptz, reviewed_by_user_id uuid, decision_note text, internal_note text,
 submitted_payload jsonb NOT NULL, review_payload jsonb,
 UNIQUE(tenant_id,submitted_by_member_id,request_id), UNIQUE(id,tenant_id),
 FOREIGN KEY(submitted_by_member_id,tenant_id) REFERENCES public.sales_members(id,tenant_id),
 FOREIGN KEY(lead_id,tenant_id) REFERENCES public.leads(id,tenant_id),
 CHECK(tenant_id='00000000-0000-0000-0000-000000000001')
);
CREATE INDEX sales_relationship_queue ON public.sales_relationship_requests(tenant_id,status,submitted_at);
CREATE TABLE public.sales_relationship_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
 relationship_request_id uuid NOT NULL, actor_user_id uuid NOT NULL, event_type text NOT NULL,
 payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(relationship_request_id,tenant_id) REFERENCES public.sales_relationship_requests(id,tenant_id),
 CHECK(tenant_id='00000000-0000-0000-0000-000000000001')
);
CREATE INDEX sales_relationship_event_order ON public.sales_relationship_events(relationship_request_id,created_at);
CREATE TRIGGER sales_relationship_event_immutable BEFORE UPDATE OR DELETE ON public.sales_relationship_events FOR EACH ROW EXECUTE FUNCTION public.sales_immutable_event();
CREATE TABLE public.sales_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 recipient_member_id uuid, event_key text NOT NULL, title text NOT NULL, body text NOT NULL,
 lead_id uuid, relationship_request_id uuid, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), read_at timestamptz,
 UNIQUE(tenant_id,event_key),
 FOREIGN KEY(recipient_member_id,tenant_id) REFERENCES public.sales_members(id,tenant_id),
 FOREIGN KEY(lead_id,tenant_id) REFERENCES public.leads(id,tenant_id),
 FOREIGN KEY(relationship_request_id,tenant_id) REFERENCES public.sales_relationship_requests(id,tenant_id),
 CHECK(tenant_id='00000000-0000-0000-0000-000000000001')
);
CREATE INDEX sales_notification_inbox ON public.sales_notifications(tenant_id,recipient_member_id,created_at DESC);

CREATE FUNCTION public.sales_input_keys(p_input jsonb,p_allowed text[]) RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) k WHERE NOT(k=ANY(p_allowed))) THEN RAISE EXCEPTION 'Unexpected input field'; END IF;
END $$;
CREATE FUNCTION public.sales_notify(p_member uuid,p_key text,p_title text,p_body text,p_lead uuid DEFAULT NULL,p_request uuid DEFAULT NULL) RETURNS void LANGUAGE sql SET search_path=public,pg_temp AS $$
 INSERT INTO sales_notifications(tenant_id,recipient_member_id,event_key,title,body,lead_id,relationship_request_id)
 VALUES('00000000-0000-0000-0000-000000000001',p_member,p_key,p_title,p_body,p_lead,p_request) ON CONFLICT(tenant_id,event_key) DO NOTHING
$$;
CREATE FUNCTION public.sales_is_protected(p_lead uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT coalesce((SELECT l.status IN('converted','lost','disqualified') OR EXISTS(
  SELECT 1 FROM outreach_suppressions s WHERE s.tenant_id=l.tenant_id AND s.active AND (s.expires_at IS NULL OR s.expires_at>now()) AND (
   s.scope='global' OR (s.scope='lead' AND s.normalized_value=l.id::text) OR
   (s.scope='email' AND lower(s.normalized_value)=lower(l.email)) OR
   (s.scope='phone' AND sales_phone(s.normalized_value)=sales_phone(l.phone)) OR
   (s.scope='domain' AND sales_domain(s.normalized_value)=sales_domain(l.company_domain)) OR
   (s.scope='contact' AND s.normalized_value=l.ghl_contact_id)))
 FROM leads l WHERE l.id=p_lead AND l.tenant_id='00000000-0000-0000-0000-000000000001'),true)
$$;
CREATE FUNCTION public.sales_review_version(p_lead_id uuid) RETURNS text LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT md5(jsonb_build_object('lead',to_jsonb(l),'assignment',(SELECT to_jsonb(a) FROM sales_account_assignments a WHERE a.lead_id=l.id),
  'activity',(SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id,created_at,activity_type,metadata FROM lead_activities WHERE lead_id=l.id AND tenant_id=l.tenant_id ORDER BY created_at DESC,id LIMIT 10) x),
  'events',(SELECT jsonb_build_array(count(*),max(created_at)) FROM sales_registration_events WHERE lead_id=l.id AND tenant_id=l.tenant_id))::text)
 FROM leads l WHERE l.id=p_lead_id AND l.tenant_id='00000000-0000-0000-0000-000000000001'
$$;

CREATE FUNCTION public.sales_match(p_actor jsonb,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE t uuid:=(p_actor->>'tenantId')::uuid; m uuid:=(p_actor->>'memberId')::uuid; ids uuid[]; strong boolean; kind text; r sales_match_lookups; clean jsonb;
BEGIN
 PERFORM sales_assert_actor(p_actor);
 PERFORM sales_input_keys(p_input,ARRAY['company_name','email','phone','website']);
 IF m IS NULL OR length(btrim(coalesce(p_input->>'company_name','')))<2 OR length(p_input::text)>1500 OR coalesce(nullif(btrim(p_input->>'email'),''),sales_phone(p_input->>'phone'),sales_domain(p_input->>'website')) IS NULL THEN RAISE EXCEPTION 'Business name and one contact identifier required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sales-lookup:'||m,0));
 -- Temporary lookup data is retained for at most a day of quota evidence, not business attribution.
 DELETE FROM sales_match_lookups WHERE tenant_id=t AND created_at<clock_timestamp()-interval '24 hours';
 IF (SELECT count(*) FROM sales_match_lookups WHERE member_id=m AND created_at>clock_timestamp()-interval '1 minute')>=10 OR
    (SELECT count(*) FROM sales_match_lookups WHERE member_id=m AND created_at>clock_timestamp()-interval '1 hour')>=100 OR
    (SELECT count(*) FROM sales_match_lookups WHERE member_id=m)>=1000 THEN RAISE EXCEPTION 'Lookup rate limit exceeded'; END IF;
 clean:=jsonb_build_object('company_name',btrim(p_input->>'company_name'),'email',nullif(lower(btrim(p_input->>'email')),''),'phone',sales_phone(p_input->>'phone'),'website',sales_domain(p_input->>'website'));
 SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO ids FROM (SELECT id FROM leads WHERE tenant_id=t AND (
  (clean->>'email' IS NOT NULL AND lower(btrim(email))=clean->>'email') OR
  (clean->>'phone' IS NOT NULL AND sales_phone(phone)=clean->>'phone') OR
  (clean->>'website' IS NOT NULL AND sales_domain(company_domain)=clean->>'website')) ORDER BY id LIMIT 5) q;
 strong:=cardinality(ids)>0;
 IF NOT strong THEN SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO ids FROM (SELECT id FROM leads WHERE tenant_id=t AND sales_name(company_name)=sales_name(clean->>'company_name') ORDER BY id LIMIT 5) q; END IF;
 kind:=CASE WHEN cardinality(ids)=0 THEN 'no_match' WHEN NOT strong OR cardinality(ids)>1 THEN 'possible_match' ELSE 'existing_review_required' END;
 IF cardinality(ids)>0 AND EXISTS(SELECT 1 FROM leads l LEFT JOIN sales_account_assignments a ON a.lead_id=l.id WHERE l.id=ANY(ids) AND (CASE WHEN coalesce(a.ownership_overridden,false) THEN a.assigned_member_id IS NOT NULL ELSE l.assigned_to IS NOT NULL END)) THEN kind:='already_working'; END IF;
 IF EXISTS(SELECT 1 FROM sales_relationship_requests WHERE tenant_id=t AND submitted_by_member_id=m AND status IN('pending','information_requested') AND candidate_lead_ids&&ids) OR EXISTS(
  SELECT 1 FROM sales_registrations s WHERE s.tenant_id=t AND s.status='pending' AND (
   (clean->>'email' IS NOT NULL AND lower(s.email)=clean->>'email') OR (clean->>'phone' IS NOT NULL AND sales_phone(s.phone)=clean->>'phone') OR
   (clean->>'website' IS NOT NULL AND sales_domain(s.website)=clean->>'website') OR sales_name(s.company_name)=sales_name(clean->>'company_name'))) THEN kind:='request_pending'; END IF;
 INSERT INTO sales_match_lookups(tenant_id,member_id,actor_user_id,input,candidate_lead_ids,status) VALUES(t,m,(p_actor->>'userId')::uuid,clean,ids,kind) RETURNING * INTO r;
 RETURN jsonb_build_object('lookup_id',r.id,'status',r.status,'expires_at',r.expires_at);
END $$;

CREATE FUNCTION public.sales_relationship_submit(p_actor jsonb,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE t uuid:=(p_actor->>'tenantId')::uuid; m uuid:=(p_actor->>'memberId')::uuid; lookup sales_match_lookups; r sales_relationship_requests;
BEGIN
 PERFORM sales_assert_actor(p_actor);PERFORM sales_input_keys(p_input,ARRAY['request_id','lookup_id','contact_name','relationship_note','last_contact_at','last_contact_summary']);
 IF m IS NULL THEN RAISE EXCEPTION 'Rep member required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sales-registry:'||t,0));
 SELECT * INTO r FROM sales_relationship_requests WHERE tenant_id=t AND submitted_by_member_id=m AND request_id=(p_input->>'request_id')::uuid;
 IF FOUND THEN IF r.submitted_payload<>p_input THEN RAISE EXCEPTION 'Request replay differs'; END IF; RETURN to_jsonb(r); END IF;
 SELECT * INTO lookup FROM sales_match_lookups WHERE id=(p_input->>'lookup_id')::uuid AND tenant_id=t AND member_id=m AND actor_user_id=(p_actor->>'userId')::uuid AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'Lookup missing, expired, or belongs to another member. Check prospect again'; END IF;
 IF cardinality(lookup.candidate_lead_ids)=0 THEN RAISE EXCEPTION 'No canonical match; submit operator for identity review'; END IF;
 IF length(btrim(coalesce(p_input->>'contact_name','')))<2 OR length(btrim(coalesce(p_input->>'relationship_note','')))<3 OR length(btrim(coalesce(p_input->>'last_contact_summary','')))<3 OR length(p_input::text)>6000 THEN RAISE EXCEPTION 'Contact, relationship and last-conversation summary required'; END IF;
 IF nullif(p_input->>'last_contact_at','')::date>current_date THEN RAISE EXCEPTION 'Last contact cannot be in the future'; END IF;
 SELECT * INTO r FROM sales_relationship_requests WHERE tenant_id=t AND submitted_by_member_id=m AND status IN('pending','information_requested') AND candidate_lead_ids&&lookup.candidate_lead_ids ORDER BY submitted_at LIMIT 1;
 IF FOUND THEN RETURN to_jsonb(r); END IF;
 INSERT INTO sales_relationship_requests(tenant_id,request_id,submitted_by_user_id,submitted_by_member_id,submitted_by_name,company_name,candidate_lead_ids,contact_name,relationship_note,last_contact_at,last_contact_summary,submitted_payload)
 VALUES(t,(p_input->>'request_id')::uuid,(p_actor->>'userId')::uuid,m,p_actor->>'displayName',lookup.input->>'company_name',lookup.candidate_lead_ids,btrim(p_input->>'contact_name'),btrim(p_input->>'relationship_note'),nullif(p_input->>'last_contact_at','')::date,btrim(p_input->>'last_contact_summary'),p_input) RETURNING * INTO r;
 INSERT INTO sales_relationship_events(tenant_id,relationship_request_id,actor_user_id,event_type,payload) VALUES(t,r.id,(p_actor->>'userId')::uuid,'submitted',jsonb_build_object('status','pending','relationship_note',r.relationship_note,'last_contact_at',r.last_contact_at,'last_contact_summary',r.last_contact_summary));
 PERFORM sales_notify(NULL,'relationship:'||r.id||':submitted','Relationship Review Requested','A rep requested your relationship review.',NULL,r.id);
 RETURN to_jsonb(r);
END $$;

CREATE FUNCTION public.sales_relationship_respond(p_actor jsonb,p_request_id uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE r sales_relationship_requests; newstate text;
BEGIN
 PERFORM sales_assert_actor(p_actor);PERFORM sales_input_keys(p_input,ARRAY['action','relationship_note','last_contact_at','last_contact_summary']);
 PERFORM pg_advisory_xact_lock(hashtextextended('sales-registry:'||(p_actor->>'tenantId'),0));
 SELECT * INTO r FROM sales_relationship_requests WHERE id=p_request_id AND tenant_id=(p_actor->>'tenantId')::uuid FOR UPDATE;
 IF NOT FOUND OR r.submitted_by_member_id IS DISTINCT FROM (p_actor->>'memberId')::uuid THEN RAISE EXCEPTION 'Request owner required'; END IF;
 IF p_input->>'action'='withdraw' AND r.status IN('pending','information_requested') THEN newstate:='withdrawn';
 ELSIF p_input->>'action'='respond' AND r.status='information_requested' THEN
  IF length(btrim(coalesce(p_input->>'relationship_note','')))<3 OR length(btrim(coalesce(p_input->>'last_contact_summary','')))<3 OR length(p_input::text)>5000 THEN RAISE EXCEPTION 'Relationship and conversation summary required'; END IF;
  IF nullif(p_input->>'last_contact_at','')::date>current_date THEN RAISE EXCEPTION 'Last contact cannot be in the future'; END IF;
  newstate:='pending';
 ELSE RAISE EXCEPTION 'Request state changed; refresh before responding'; END IF;
 UPDATE sales_relationship_requests SET status=newstate,relationship_note=CASE WHEN newstate='pending' THEN btrim(p_input->>'relationship_note') ELSE relationship_note END,
 last_contact_summary=CASE WHEN newstate='pending' THEN btrim(p_input->>'last_contact_summary') ELSE last_contact_summary END,
 last_contact_at=CASE WHEN newstate='pending' THEN nullif(p_input->>'last_contact_at','')::date ELSE last_contact_at END,updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
 INSERT INTO sales_relationship_events(tenant_id,relationship_request_id,actor_user_id,event_type,payload) VALUES(r.tenant_id,r.id,(p_actor->>'userId')::uuid,p_input->>'action',jsonb_build_object('status',r.status,'relationship_note',r.relationship_note,'last_contact_at',r.last_contact_at,'last_contact_summary',r.last_contact_summary));
 PERFORM sales_notify(NULL,'relationship:'||r.id||':'||r.updated_at,'Relationship Request Updated','A rep updated a relationship request.',NULL,r.id);
 RETURN to_jsonb(r);
END $$;

CREATE FUNCTION public.sales_relationship_review_version(p_lead_id uuid,p_request_id uuid) RETURNS text LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT md5(sales_review_version(p_lead_id)||':'||r.updated_at::text||':'||r.status)
 FROM sales_relationship_requests r WHERE r.id=p_request_id AND r.tenant_id='00000000-0000-0000-0000-000000000001' AND p_lead_id=ANY(r.candidate_lead_ids)
$$;
CREATE FUNCTION public.sales_relationship_context(p_actor jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE r sales_relationship_requests; candidates jsonb;
BEGIN
 PERFORM sales_assert_actor(p_actor,true);
 SELECT * INTO r FROM sales_relationship_requests WHERE id=p_request_id AND tenant_id=(p_actor->>'tenantId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('lead_id',l.id,'company_name',l.company_name,'status',l.status,
  'current_owner',CASE WHEN coalesce(a.ownership_overridden,false) THEN coalesce(m.display_name,'Unassigned') ELSE coalesce(l.assigned_to,'Unassigned') END,
  'review_version',sales_relationship_review_version(l.id,r.id),'ghl_contact_linked',l.ghl_contact_id IS NOT NULL,'protected',sales_is_protected(l.id),
  'activities',coalesce((SELECT jsonb_agg(jsonb_build_object('activity_type',x.activity_type,'channel',x.channel,'created_at',x.created_at,'summary',left(coalesce(x.metadata->>'note',x.metadata->>'summary',x.metadata->>'body','Recorded activity; review original CRM record for details'),1200))) FROM (SELECT * FROM lead_activities WHERE lead_id=l.id AND tenant_id=l.tenant_id ORDER BY created_at DESC,id LIMIT 10) x),'[]'::jsonb)) ORDER BY l.company_name),'[]'::jsonb) INTO candidates
 FROM leads l LEFT JOIN sales_account_assignments a ON a.lead_id=l.id LEFT JOIN sales_members m ON m.id=a.assigned_member_id
 WHERE l.tenant_id=r.tenant_id AND l.id=ANY(r.candidate_lead_ids);
 RETURN jsonb_build_object('candidates',candidates,'coverage',jsonb_build_object('email','not_connected','whatsapp','not_connected','granola','not_connected','crm','recorded_activity_only'));
END $$;

CREATE FUNCTION public.sales_pause_outreach(p_lead_id uuid) RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE t uuid:='00000000-0000-0000-0000-000000000001';
BEGIN
 PERFORM 1 FROM leads WHERE id=p_lead_id AND tenant_id=t FOR UPDATE;
 IF NOT FOUND OR sales_is_protected(p_lead_id) THEN RAISE EXCEPTION 'Protected or suppressed account requires separate administrator resolution'; END IF;
 PERFORM 1 FROM outreach_sequence_actions WHERE lead_id=p_lead_id AND tenant_id=t FOR UPDATE;
 PERFORM 1 FROM outreach_send_attempts WHERE lead_id=p_lead_id AND tenant_id=t FOR UPDATE;
 IF EXISTS(SELECT 1 FROM outreach_sequence_actions WHERE lead_id=p_lead_id AND tenant_id=t AND status='processing') OR EXISTS(SELECT 1 FROM outreach_send_attempts WHERE lead_id=p_lead_id AND tenant_id=t AND status IN('attempting','ambiguous')) THEN RAISE EXCEPTION 'Sending is in flight or unresolved; resolve before handoff'; END IF;
 UPDATE outreach_sequence_enrollments SET status='paused',exit_reason='sales_handoff',next_action_at=NULL WHERE lead_id=p_lead_id AND tenant_id=t AND status='active';
 UPDATE outreach_sequence_actions SET status='cancelled',error_detail='sales_handoff' WHERE lead_id=p_lead_id AND tenant_id=t AND status='pending';
END $$;
CREATE FUNCTION public.sales_assignment_outreach_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE prior sales_account_assignments;
BEGIN
 -- INSERT ... ON CONFLICT fires BEFORE INSERT even for a note-only upsert. Compare
 -- against the existing row so a work update is never mistaken for a handoff.
 SELECT * INTO prior FROM sales_account_assignments WHERE lead_id=NEW.lead_id AND tenant_id=NEW.tenant_id;
 IF NEW.tenant_id='00000000-0000-0000-0000-000000000001' AND NEW.ownership_overridden AND NEW.assigned_member_id IS NOT NULL AND (prior.lead_id IS NULL OR NEW.assigned_member_id IS DISTINCT FROM prior.assigned_member_id OR NOT prior.ownership_overridden) THEN
  PERFORM sales_pause_outreach(NEW.lead_id); NEW.sales_outreach_hold:=true;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sales_assignment_outreach_hold BEFORE INSERT OR UPDATE ON public.sales_account_assignments FOR EACH ROW EXECUTE FUNCTION public.sales_assignment_outreach_guard();
CREATE FUNCTION public.sales_sending_hold_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.tenant_id='00000000-0000-0000-0000-000000000001' AND NEW.status IN('active','processing','attempting') THEN
  PERFORM 1 FROM leads WHERE id=NEW.lead_id AND tenant_id=NEW.tenant_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM sales_account_assignments WHERE lead_id=NEW.lead_id AND tenant_id=NEW.tenant_id AND sales_outreach_hold) THEN RAISE EXCEPTION 'Sales handoff outreach hold is active'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sales_enrollment_hold BEFORE INSERT OR UPDATE OF status ON public.outreach_sequence_enrollments FOR EACH ROW EXECUTE FUNCTION public.sales_sending_hold_guard();
CREATE TRIGGER sales_action_hold BEFORE INSERT OR UPDATE OF status ON public.outreach_sequence_actions FOR EACH ROW EXECUTE FUNCTION public.sales_sending_hold_guard();
CREATE TRIGGER sales_attempt_hold BEFORE INSERT OR UPDATE OF status ON public.outreach_send_attempts FOR EACH ROW EXECUTE FUNCTION public.sales_sending_hold_guard();

CREATE FUNCTION public.sales_relationship_review(p_actor jsonb,p_request_id uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE r sales_relationship_requests; target uuid; oldmember uuid; decision text:=p_input->>'decision'; ownerkey text; assist text;
BEGIN
 PERFORM sales_assert_actor(p_actor,true);
 PERFORM sales_input_keys(p_input,ARRAY['decision','decision_note','internal_note','lead_id','review_version','founder_assist','handoff_summary','next_action','next_action_due_at','next_action_owner','external_clearance_confirmed']);
 IF decision NOT IN('approved','declined','information_requested') OR length(btrim(coalesce(p_input->>'decision_note','')))<3 OR length(p_input::text)>12000 THEN RAISE EXCEPTION 'Decision and rep-visible note required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sales-registry:'||(p_actor->>'tenantId'),0));
 SELECT * INTO r FROM sales_relationship_requests WHERE id=p_request_id AND tenant_id=(p_actor->>'tenantId')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
 IF r.status NOT IN('pending','information_requested') THEN
  IF r.status=decision AND r.reviewed_by_user_id=(p_actor->>'userId')::uuid AND r.review_payload=p_input THEN RETURN to_jsonb(r); END IF;
  RAISE EXCEPTION 'Request already decided; history cannot be overwritten';
 END IF;
 IF decision='approved' THEN
  target:=nullif(p_input->>'lead_id','')::uuid;
  IF target IS NULL OR NOT(target=ANY(r.candidate_lead_ids)) THEN RAISE EXCEPTION 'Choose a matched canonical account'; END IF;
  PERFORM 1 FROM leads WHERE id=target AND tenant_id=r.tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account no longer available'; END IF;
  IF p_input->>'review_version' IS DISTINCT FROM sales_relationship_review_version(target,r.id) THEN RAISE EXCEPTION 'Account context changed; refresh review before approving'; END IF;
  IF NOT coalesce((p_input->>'external_clearance_confirmed')::boolean,false) THEN RAISE EXCEPTION 'Manual external conversation and outreach clearance required'; END IF;
  IF length(btrim(coalesce(p_input->>'handoff_summary','')))<3 OR length(btrim(coalesce(p_input->>'next_action','')))<3 OR nullif(p_input->>'next_action_due_at','') IS NULL THEN RAISE EXCEPTION 'Shared handoff summary, next action and due date required'; END IF;
  IF (p_input->>'next_action_due_at')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'Next action due date must be in the future'; END IF;
  IF NOT EXISTS(SELECT 1 FROM sales_members WHERE id=r.submitted_by_member_id AND tenant_id=r.tenant_id AND active) THEN RAISE EXCEPTION 'Requesting rep is not active'; END IF;
  ownerkey:=coalesce(p_input->>'next_action_owner','account_owner');assist:=coalesce(p_input->>'founder_assist','none');
  IF ownerkey NOT IN('account_owner','gregory','unassigned') OR assist NOT IN('none','active') THEN RAISE EXCEPTION 'Invalid next-action owner or founder assistance'; END IF;
  SELECT assigned_member_id INTO oldmember FROM sales_account_assignments WHERE lead_id=target AND tenant_id=r.tenant_id FOR UPDATE;
  PERFORM sales_pause_outreach(target);
  INSERT INTO sales_account_assignments(tenant_id,lead_id,assigned_member_id,ownership_overridden,next_action,next_action_due_at,founder_assist,next_action_owner,handoff_summary,sales_outreach_hold,updated_at)
  VALUES(r.tenant_id,target,r.submitted_by_member_id,true,btrim(p_input->>'next_action'),(p_input->>'next_action_due_at')::timestamptz,assist,ownerkey,btrim(p_input->>'handoff_summary'),true,clock_timestamp())
  ON CONFLICT(lead_id) DO UPDATE SET assigned_member_id=EXCLUDED.assigned_member_id,ownership_overridden=true,next_action=EXCLUDED.next_action,next_action_due_at=EXCLUDED.next_action_due_at,founder_assist=EXCLUDED.founder_assist,next_action_owner=EXCLUDED.next_action_owner,handoff_summary=EXCLUDED.handoff_summary,sales_outreach_hold=true,updated_at=clock_timestamp();
  INSERT INTO sales_registration_events(tenant_id,lead_id,actor_user_id,event_type,payload) VALUES(r.tenant_id,target,(p_actor->>'userId')::uuid,'account_handoff',jsonb_build_object('previous_member_id',oldmember,'assigned_member_id',r.submitted_by_member_id,'reason',p_input->>'decision_note','note',p_input->>'handoff_summary','next_action',p_input->>'next_action','visibility','shared','external_clearance','manual_by_reviewer'));
  IF oldmember IS NOT NULL AND oldmember<>r.submitted_by_member_id THEN PERFORM sales_notify(oldmember,'relationship:'||r.id||':previous-owner','Account Ownership Updated','An account was handed off. My Leads shows your current assignments.'); END IF;
 END IF;
 UPDATE sales_relationship_requests SET status=decision,lead_id=CASE WHEN decision='approved' THEN target ELSE lead_id END,decision_note=btrim(p_input->>'decision_note'),internal_note=nullif(btrim(p_input->>'internal_note'),''),reviewed_at=clock_timestamp(),updated_at=clock_timestamp(),reviewed_by_user_id=(p_actor->>'userId')::uuid,review_payload=p_input WHERE id=r.id RETURNING * INTO r;
 INSERT INTO sales_relationship_events(tenant_id,relationship_request_id,actor_user_id,event_type,payload) VALUES(r.tenant_id,r.id,(p_actor->>'userId')::uuid,'reviewed',jsonb_build_object('status',r.status,'public_note',r.decision_note,'internal_note',r.internal_note));
 PERFORM sales_notify(r.submitted_by_member_id,'relationship:'||r.id||':'||r.updated_at,'Relationship Review Updated','Your relationship request has a decision or a question.',CASE WHEN decision='approved' THEN target ELSE NULL END,r.id);
 RETURN to_jsonb(r);
END $$;

CREATE FUNCTION public.sales_work_update(p_actor jsonb,p_lead_id uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE a sales_account_assignments; l leads; isadmin boolean:=coalesce((p_actor->>'isAdmin')::boolean,false); eventid uuid;
BEGIN
 PERFORM sales_assert_actor(p_actor);PERFORM sales_input_keys(p_input,ARRAY['next_action','next_action_due_at','outcome_note','next_action_owner','founder_assist','status']);
 IF p_input='{}'::jsonb OR length(p_input::text)>6000 THEN RAISE EXCEPTION 'Choose a bounded work update'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sales-registry:'||(p_actor->>'tenantId'),0));
 SELECT * INTO l FROM leads WHERE id=p_lead_id AND tenant_id=(p_actor->>'tenantId')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account not found in Exotiq'; END IF;
 SELECT * INTO a FROM sales_account_assignments WHERE lead_id=p_lead_id AND tenant_id=l.tenant_id FOR UPDATE;
 IF NOT isadmin AND (a.assigned_member_id IS NULL OR a.assigned_member_id IS DISTINCT FROM (p_actor->>'memberId')::uuid) THEN RAISE EXCEPTION 'Account is not assigned to this member'; END IF;
 IF NOT isadmin AND (p_input ? 'founder_assist') AND p_input->>'founder_assist'<>'requested' THEN RAISE EXCEPTION 'Admin must activate or dismiss founder assistance'; END IF;
 IF p_input ? 'next_action_owner' AND p_input->>'next_action_owner' NOT IN('account_owner','gregory','unassigned') THEN RAISE EXCEPTION 'Invalid next-action owner'; END IF;
 IF p_input ? 'founder_assist' AND p_input->>'founder_assist' NOT IN('none','requested','active') THEN RAISE EXCEPTION 'Invalid founder assistance'; END IF;
 IF p_input ? 'status' THEN
  IF (NOT isadmin AND (p_input->>'status' NOT IN('engaged','qualified','lost') OR l.status IN('converted','lost','disqualified'))) OR (isadmin AND p_input->>'status' NOT IN('new','engaged','qualified','converted','lost','disqualified')) THEN RAISE EXCEPTION 'Status transition requires administrator review'; END IF;
  UPDATE leads SET status=p_input->>'status' WHERE id=l.id;
 END IF;
 INSERT INTO sales_account_assignments(tenant_id,lead_id,assigned_member_id,ownership_overridden,next_action,next_action_due_at,next_action_owner,founder_assist)
 VALUES(l.tenant_id,l.id,a.assigned_member_id,coalesce(a.ownership_overridden,false),CASE WHEN p_input ? 'next_action' THEN nullif(btrim(p_input->>'next_action'),'') ELSE a.next_action END,
 CASE WHEN p_input ? 'next_action_due_at' THEN nullif(p_input->>'next_action_due_at','')::timestamptz ELSE a.next_action_due_at END,
 coalesce(p_input->>'next_action_owner',a.next_action_owner,'account_owner'),coalesce(p_input->>'founder_assist',a.founder_assist,'none'))
 ON CONFLICT(lead_id) DO UPDATE SET next_action=EXCLUDED.next_action,next_action_due_at=EXCLUDED.next_action_due_at,next_action_owner=EXCLUDED.next_action_owner,founder_assist=EXCLUDED.founder_assist,updated_at=clock_timestamp() RETURNING * INTO a;
 INSERT INTO sales_registration_events(tenant_id,lead_id,actor_user_id,event_type,payload) VALUES(l.tenant_id,l.id,(p_actor->>'userId')::uuid,'account_update',jsonb_build_object('visibility','shared','note',nullif(btrim(p_input->>'outcome_note'),''),'next_action',a.next_action,'next_action_due_at',a.next_action_due_at,'next_action_owner',a.next_action_owner,'status',coalesce(p_input->>'status',l.status),'founder_assist',a.founder_assist)) RETURNING id INTO eventid;
 IF p_input->>'founder_assist'='requested' OR p_input->>'next_action_owner'='gregory' THEN PERFORM sales_notify(NULL,'work:'||eventid,'Founder Follow-Up Requested','A rep requested your help or assigned a next action.',l.id); END IF;
 RETURN to_jsonb(a);
END $$;
CREATE FUNCTION public.sales_notification_read(p_actor jsonb,p_notification_id uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE n sales_notifications;
BEGIN
 PERFORM sales_assert_actor(p_actor);
 UPDATE sales_notifications SET read_at=coalesce(read_at,clock_timestamp()) WHERE id=p_notification_id AND tenant_id=(p_actor->>'tenantId')::uuid AND
 (CASE WHEN coalesce((p_actor->>'isAdmin')::boolean,false) THEN recipient_member_id IS NULL ELSE recipient_member_id=(p_actor->>'memberId')::uuid END) RETURNING * INTO n;
 IF NOT FOUND THEN RAISE EXCEPTION 'Notification does not belong to this recipient'; END IF;
 RETURN to_jsonb(n);
END $$;
CREATE FUNCTION public.sales_registration_notification() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.tenant_id='00000000-0000-0000-0000-000000000001' THEN
  IF TG_OP='INSERT' THEN PERFORM sales_notify(NULL,'registration:'||NEW.id||':submitted','Operator Submission Pending','An operator introduction needs your review.');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN PERFORM sales_notify(NEW.submitted_by_member_id,'registration:'||NEW.id||':'||NEW.status,'Operator Submission Reviewed','Your submission receipt has been updated. Open My Submissions.'); END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sales_source_receipt_notifications AFTER INSERT OR UPDATE OF status ON public.sales_registrations FOR EACH ROW EXECUTE FUNCTION public.sales_registration_notification();

DO $$ DECLARE t text; f record; BEGIN
 FOREACH t IN ARRAY ARRAY['sales_match_lookups','sales_relationship_requests','sales_relationship_events','sales_notifications'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role',t);
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'sales\_%' ESCAPE '\' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
