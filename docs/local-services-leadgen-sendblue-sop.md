# Local Services lead generation + Sendblue/GHL outreach SOP

## Scope

Tenant: `local-services` (`22222222-2222-2222-2222-222222222222`)

Verticals:

- HVAC
- Garage Doors
- Driveways
- Aging-in-Place Contractors

Source: Outscraper Google Maps Data Scraper. Use Google Places API later only if we need stricter compliance or field validation.

Execution path:

1. Outscraper pulls local business records.
2. `scripts/local_services_outscraper.ts` normalizes, dedupes, scores contact completeness, and imports to Saul Leads Dashboard.
3. The dashboard is canonical.
4. Clean phone leads get pending `sms` outreach queue drafts.
5. GHL/Sendblue sends only after approval and only after Sendblue plan/outbound eligibility is confirmed.
6. Twilio stays focused on phone agents/voice. Do not depend on Twilio SMS for internal lead notifications until A2P is fixed.

## Required environment variables

```bash
# Outscraper
OUTSCRAPER_API_KEY=...
# Optional override if Outscraper changes docs/endpoints:
OUTSCRAPER_BASE_URL=https://api.outscraper.cloud
OUTSCRAPER_MAPS_PATH=/maps/search-v3

# Supabase dashboard
SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# Optional GHL local-services override. Falls back to GHL_API_KEY/GHL_LOCATION_ID.
GHL_LOCAL_SERVICES_API_KEY=...
GHL_LOCAL_SERVICES_LOCATION_ID=...

# Demo/test-call number inserted into follow-up template.
LOCAL_SERVICES_DEMO_NUMBER=+1...
```

## Commands

Seed tenant/stages/ICP/templates:

```bash
npx tsx scripts/local_services_outscraper.ts seed --live
```

Dry-run lead pull, no dashboard writes:

```bash
npx tsx scripts/local_services_outscraper.ts search \
  --vertical hvac \
  --location "Denver, CO" \
  --max-results 50
```

Live import + pending outreach drafts:

```bash
npx tsx scripts/local_services_outscraper.ts search \
  --vertical hvac \
  --location "Denver, CO" \
  --max-results 50 \
  --live
```

Live import + dry-run/real GHL sync depending on credentials:

```bash
npx tsx scripts/local_services_outscraper.ts search \
  --vertical garage_doors \
  --location "Denver, CO" \
  --max-results 50 \
  --live \
  --sync-ghl
```

Import a previously normalized artifact:

```bash
npx tsx scripts/local_services_outscraper.ts import-file \
  --input output/local-services/<run>.normalized.json \
  --live
```

## Cost-control rules

Start with 50 leads per vertical per market. Inspect quality before scaling.

Recommended first run:

- 50 HVAC
- 50 Garage Doors
- 50 Driveways
- 50 Aging-in-Place Contractors

Do not enable paid enrichments by default. The MVP only needs:

- name
- phone
- website/domain
- address/city/state
- Google/Outscraper IDs
- rating/review count
- category
- maps URL

Run larger pulls only after the first quality sample is reviewed.

## Dedupe rules

Dedupe in this order:

1. Google Place ID / provider ID
2. normalized phone
3. normalized website domain
4. normalized company name + city

Never sync duplicates to GHL. If in doubt, keep the dashboard record and skip the new import row.

## Outreach control copy

First touch:

```text
Hey, quick question — are you still taking [service type] jobs in [City]?

Thanks,
Gregory
```

Yes reply:

```text
Awesome. I set up 24/7 phone agents for local [service type] companies so missed calls still turn into leads.

Free setup, no contract, and you only pay $50 if you close a job from one of those calls.

Want to call one and hear it?
```

Demo handoff:

```text
Perfect. Try this number: [demo number]

Call like you are a customer needing [service type]. If it sounds useful, I can set one up around your services, hours, and service area.
```

Do not say `trained on your business` in first-touch/early follow-up. Say `set one up around your services, hours, and service area` after they are interested.

## Sendblue/GHL rules

- Use Sendblue through GHL workflows for initial outbound if possible.
- Confirm the Sendblue account supports proactive outbound, not only inbound/free shared-line messaging.
- Use dashboard/GHL approval wall before sending.
- Send during local business hours only.
- Cap daily sends per line/vertical until reply rates are known.
- Stop immediately on `stop`, `unsubscribe`, `no`, `not interested`, angry replies, or wrong number.
- Log variant, service type, Sendblue service (`iMessage`, `SMS`, `RCS`), status, and reply outcome.

## Twilio/A2P decision

A2P does matter for Twilio SMS, but it should not block this project.

Use Telegram/email/dashboard/GHL tasks for internal lead alerts first. That avoids the previous problem where Twilio texting Gregory was blocked by A2P registration issues.

Handle Twilio A2P later for:

- SMS to business owners
- SMS confirmations to consumers
- Twilio-native follow-up texting
- internal SMS alerts if Telegram/email is not enough

Twilio voice agents can continue without A2P SMS approval.

## Internal lead alerts

Near-term: send internal notifications through Telegram, not Twilio SMS.

Suggested alert payload:

```text
New [Vertical] inbound lead

Name: [name]
Phone: [phone]
Service: [service]
Urgency: [urgency]
Summary: [summary]
Dashboard: [link]
GHL: [link]
```

If Telegram fails, use email or a GHL task as fallback.
