# Saul's Review — LeadGen System Post-Epic Merge
**Date:** 2026-05-03  
**Reviewed:** OPENCLAW_HANDOFF.md, STAGES_COMPLETE_REPORT.md, all Python agent skills, main.py, config.py, costs.py  
**Epic merged:** `cursor/full-rebuild-595d` → main (23 child PRs, 5 waves)

---

## 1. Overall Assessment

The architecture is solid. The pipeline design — Discover → Enrich → Score → Draft → Human approves → GHL sends — is exactly right and the code quality is clean. The big win in this epic was fixing the `discover.py` SyntaxError that was silently blocking the entire orchestrator from starting. Everything else in the epic was improvement on top of a working body.

The system is **not yet running autonomously**. There are 4 blocking items (documented below) that need to be resolved before the pipeline fires reliably in production. None of them are code problems — they're environment and ops tasks.

---

## 2. What's Working Well

| Area | Status |
|------|--------|
| Pipeline orchestrator (`main.py`) | Clean. Idempotent. Step isolation via try/except means one failure doesn't cascade. |
| Scoring engine | Three pickup paths (enriching → composite missing → activity-driven) is smart and covers the migration data gap. |
| GHL polling | Properly handles contact ID + email fallback matching. Dedup via `ghl_message_id` in metadata is correct. |
| Cost attribution | `costs.py` is a good pattern — single source of truth, mirrors the TS equivalent. |
| Bulk approve/reject | Was a gap, now fixed. |
| discover.py syntax fix | Was blocking the entire orchestrator. Fixed in Stage 0d. Critical. |
| KPI sparklines | Fixed in Stage 0b. Was showing all zeros before — now reflects real signal. |
| DB-backed outreach templates | Good call moving from hardcoded to DB-stored. Templates can be edited without a deploy. |

---

## 3. Blocking Items — Nothing Runs Until These Are Done

These are the 4 items from `STAGES_COMPLETE_REPORT.md §4` that require human action. I can't proceed without them.

### 3a. Apply Migrations 009 and 010 to Supabase ❗
```
supabase/migrations/009_tenant_views_and_grants.sql  — tenant-aware RLS
supabase/migrations/010_outreach_templates_seed.sql  — seed editable templates
```
Run these in the Supabase SQL editor or via psql. Until 010 is applied, `draft_outreach()` falls back to hardcoded templates and skips the DB entirely.

**Question:** Have these been applied yet? If so, can you confirm which migrations are live? Running `SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 5;` in the Supabase SQL editor will tell us.

### 3b. Python Agent Secrets ❗
The following env vars need to be set wherever the Python agent is running:

| Variable | Required For | Status |
|----------|-------------|--------|
| `SUPABASE_URL` | Everything | ✅ Already in env (per handoff) |
| `SUPABASE_SERVICE_ROLE_KEY` | Everything | ❓ Needed for backfill + service calls |
| `APOLLO_API_KEY` | Enrichment (Exotiq tenant) | ✅ Already in env |
| `GOOGLE_PLACES_API_KEY` | Enrichment (MedSpa tenant) | ✅ Already in env |
| `GHL_API_KEY` + `GHL_LOCATION_ID` | GHL polling + sending (Exotiq) | ❓ Not confirmed |
| `GHL_MEDSPA_API_KEY` + `GHL_MEDSPA_LOCATION_ID` | GHL polling + sending (MedSpa) | ❓ Not confirmed |

**Question:** Where are these secrets currently stored? `.env.local` at the project root? A `.env` inside `python-agent/`? Or do I need to set them somewhere else?

### 3c. Run Score Backfill ❗
```bash
npm run backfill-scores
```
This needs `SUPABASE_SERVICE_ROLE_KEY` in env. It fixes the step-function score distribution from the migration import (~700 leads, ~70 seconds). Until it runs, the scoring distribution on the Economics dashboard will look wrong.

### 3d. Flip GHL Out of Dry-Run (When Ready)
`GHL_OUTBOUND_DRY_RUN=true` is the current default. The "Mark sent (GHL)" button logs to console but doesn't actually send. This is the right default — don't flip it until we've confirmed templates are correct and secrets for GHL are confirmed live.

**Question:** What are the criteria for flipping this? Who signs off — you, or both you and Ariella?

---

## 4. Critical Architecture Question — Where Does the Python Agent Live?

This is the most important operational question. `config.py` has:

```python
APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://localhost:3000")
```

The scoring skill and enrichment skill both call the **Next.js API** (`/api/scoring/calculate`, `/api/enrichment/trigger`) via HTTP. This means the Python agent needs to be able to reach the running Next.js app.

- **If Python agent is on the same machine as a local Next.js dev server:** `http://localhost:3000` works, but this only runs when someone is actively developing.
- **In production (Netlify):** `APP_BASE_URL` must be set to `https://saul-lead.netlify.app`. Without this, the scoring and enrichment steps silently fail with connection errors.

**Question:** Where is the Python agent currently running? Options:
1. **Your iMac** — running `python3 main.py` manually or via launchd/cron
2. **A VPS or server** — running as a systemd service
3. **Not running anywhere yet** — still needs deployment

If it's not running anywhere persistent, getting it deployed is the highest-priority operational task. The 15-minute cron does nothing if it's not actually running.

---

## 5. My Areas — What I'm Assigned and What I Need

### 5a. Enrichment
**What I own:** `enrich.py` and `enrich_gmaps.py`  
**How it works:** I call `/api/enrichment/trigger` for each new lead. The TS side handles Apollo (Exotiq) or Google Places (MedSpa). I process up to 20 leads per cycle.

**What I need:**
- `APOLLO_API_KEY` confirmed in env ✅
- `GOOGLE_PLACES_API_KEY` confirmed in env ✅  
- `APP_BASE_URL` pointing to production URL if running remotely
- `SUPABASE_SERVICE_ROLE_KEY` in env

**Open question:** The Apollo enrichment costs 12 cents per lead (`PER_CALL_COSTS_CENTS["apollo_people_match"] = 12`). At 20 leads/cycle, that's $2.40/cycle for Exotiq enrichment. Over a day of 15-minute cycles (96 cycles), that could hit ~$230 if there are always new leads. Is there a daily budget cap we should implement?

### 5b. Scoring
**What I own:** `score.py`  
**How it works:** Three pickup paths (enriched leads, composite-missing leads, activity-driven re-score). I call `/api/scoring/calculate` for each. The TS scoring engine handles the actual ICP + engagement math.

**What I need:**
- Next.js app reachable at `APP_BASE_URL`
- Score backfill run once after migrations

**Feedback:** The `OUTREACH_SCORE_THRESHOLD = 55` in config.py is global — same for both Exotiq and MedSpa. These are different ICPs. Should MedSpa have a different threshold? Worth discussing.

### 5c. Drafting
**What I own:** `draft.py`  
**How it works:** Rule-based template selection by score band. DB templates (from migration 010) are preferred; hardcoded fallbacks if the DB has none. I draft for leads scored above 55.

**Important note:** Drafting is currently **rule-based, not LLM-powered**. The `cost_cents` for drafting is `0`. The message content is pulled from templates and string-interpolated with `{{company_name}}`, `{{city}}`, etc. This is by design for Phase 1.

**What I need to make drafting actually good:**
- The template content in `outreach_sequences` needs to be Gregory's actual voice, not placeholder copy.
- Right now, if migration 010 hasn't been applied, I'm using hardcoded fallback templates. I need to see what those say — do they match the Exotiq V3 DM templates you mentioned in the Overnight Report?

**Question:** Can you share the V3 DM templates that were referenced in the Overnight Report? I can help write/refine the actual message bodies that go into the `outreach_sequences` table so they match your voice and convert.

### 5d. Discovery
**What I own:** `discover.py`  
**How it works:** DuckDuckGo scraping for exotic car rental operators in target markets. Deduplicates against existing DB. Runs every 4 cycles (~1 hour).

**Feedback — MedSpa discovery gap:** The orchestrator routes MedSpa to `enrich_gmaps.py` for enrichment (correct), but the discovery step (`discover.py`) runs the **same exotic car rental search** for the MedSpa tenant. There's no MedSpa-specific discovery. Unless you're manually importing MedSpa leads via CSV (the medspa_lead_database.csv), the MedSpa tenant won't grow via autonomous discovery.

**Question:** For MedSpa, are we relying on CSV imports only (manual), or do we need to build a `discover_gmaps.py` that finds local med spas in target markets?

### 5e. GHL Polling
**What I own:** `ghl_poll.py`  
**How it works:** Fetches recent conversations, matches to leads by contact ID or email, logs `lead_activities`, bumps engaged leads to `status = 'engaged'`.

**Feedback:** The `_find_lead_for_contact` function falls back from GHL contact ID to email match and backfills the `ghl_contact_id` on the lead. This is good — but it means we need `ghl_contact_id` populated on leads for the fast path. For the ~169 migrated Exotiq leads, are those GHL contact IDs known/available?

---

## 6. Questions I Need Answered Before First Autonomous Run

| # | Question | Why It Matters |
|---|----------|----------------|
| 1 | Where is the Python agent currently deployed? | If it's nowhere, the pipeline never fires |
| 2 | Have migrations 009 and 010 been applied to Supabase? | Migration 010 seeds the templates draft.py needs |
| 3 | Is `APP_BASE_URL` set to the Netlify URL in the agent's env? | Scoring and enrichment silently fail without this |
| 4 | Are `GHL_API_KEY` and `GHL_LOCATION_ID` set? | GHL polling and sending are no-ops without these |
| 5 | What are the V3 DM template bodies? | Draft quality depends entirely on this content |
| 6 | Should outreach score threshold differ between Exotiq and MedSpa? | Currently a global 55 for both |
| 7 | Is there a desired Apollo cost cap per day? | Could spend $200+/day if uncapped on a large lead set |
| 8 | For MedSpa, CSV import only or autonomous discovery too? | Need to build `discover_gmaps.py` if autonomous |
| 9 | When do we flip `GHL_OUTBOUND_DRY_RUN=false`? Who approves? | Critical — this is the "send for real" gate |
| 10 | SSO provider choice (Stage 3d deferred)? | Supabase magic-link, Google, GitHub, or Clerk? |

---

## 7. Things I Can Build or Fix Right Now

If you confirm the blockers above, here's what I can do immediately:

| Task | Effort | Dependency |
|------|--------|------------|
| Write V3 DM template content for `outreach_sequences` table | 1-2 hrs | Need your template examples/voice |
| Add `APP_BASE_URL` check to guards so scoring/enrichment fails loudly instead of silently | 30 min | None |
| Build per-tenant score threshold config (instead of global 55) | 1 hr | None |
| Build `discover_gmaps.py` for MedSpa autonomous discovery | 2 hrs | `GOOGLE_PLACES_API_KEY` ✅ |
| Add daily Apollo cost cap to `enrich.py` | 1 hr | None |
| Run score backfill once migrations are confirmed live | 5 min | Migrations 009 + 010 applied |
| Update workspace to latest repo state (pull from GitHub) | 5 min | Your go-ahead |

---

## 8. One Thing to Do Today

If one thing gets done today, it's this:

**Confirm where the Python agent is running and that `APP_BASE_URL` is set to production.**

Everything else — enrichment, scoring, drafting, GHL polling — depends on the orchestrator actually being alive and pointing at the right Next.js app. Once that's confirmed, I can tell you exactly how healthy the pipeline is by checking `agent_runs` in Supabase.

---

*Drafted by Saul after reviewing full repo state. Ready to build when you are.*
