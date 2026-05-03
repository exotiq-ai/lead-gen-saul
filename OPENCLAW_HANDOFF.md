# Saul OpenClaw — Agent Handoff Briefing

**Date:** 2026-05-03
**Context:** The `cursor/full-rebuild-595d` epic has been merged to `main`. This document summarizes every change that affects your (OpenClaw's) agentic workflow so you can pick up exactly where things stand.

---

## 1. What Changed — Executive Summary

94 files changed across 5 waves (Stages 0–4). The core pipeline loop is the same — **Discover → Enrich → Score → Draft → (Human Approve) → Send** — but the plumbing around you has been upgraded significantly. Nothing auto-sends. Gregory still clicks Approve.

---

## 2. Database Schema — What's New

Two new migrations were applied to Supabase:

| Migration | What it does |
|---|---|
| `009_tenant_views_and_grants.sql` | Tenant-scoped RLS via `set_request_tenant(uuid)`. The `anon` role now only sees rows matching `current_setting('app.tenant_id')`. The `service_role` (which you use) bypasses RLS — no change to your queries. |
| `010_outreach_templates_seed.sql` | Seeds `outreach_sequences` table with editable templates. Your `draft.py` now reads from this table first (see §4). |

### Tables you write to — no schema changes

- `leads` — same columns. Note: there is **no** `city`, `state`, `tags`, or `metadata` column. The dashboard maps CSV `city`/`state` → `company_location`. If you insert leads directly, use `company_location`.
- `enrichments` — same.
- `outreach_queue` — same.
- `lead_activities` — the column is `activity_type` (not `type`). Always write `activity_type`.
- `agent_runs` — same, but `cost_cents`, `tokens_used`, and `leads_processed` are now populated (see §5).

---

## 3. API Response Shapes — What Changed

### `GET /api/leads`

**Before:** `{ leads: [...], total, page, limit, has_more }`
**Now:** Returns **both** the new and legacy shapes:

```json
{
  "data": [...],
  "meta": {
    "total": 669,
    "page": 1,
    "limit": 50,
    "totalPages": 14,
    "offset": 0,
    "has_more": true,
    "red_flag_count": 12,
    "gregory_count": 45,
    "converted_this_month": 3
  },
  "leads": [...],
  "total": 669,
  "page": 1,
  "limit": 50,
  "has_more": true
}
```

If you read from `/api/leads`, prefer `data` + `meta`. The legacy flat fields still work.

### `POST /api/leads` (CSV import)

`city` and `state` from the request body are now concatenated into `company_location`. The insert no longer sends `tags` or `metadata` (those columns don't exist on the table).

### `GET /api/dashboard/kpis`

Sparklines were rewritten. `active` is now a running daily count of non-lost/non-disqualified leads (not just `created_at` buckets). `velocity` is 24h-window creation count. This doesn't affect your pipeline — it's display-only.

### `GET /api/dashboard/pipeline`

Now filters `pipeline_stages` by `tenant_id`. Dead `ghl_pipeline_stage_id` reference removed.

### New endpoints you may want to call

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/outreach/queue/bulk` | `PATCH` | Bulk approve/reject up to 200 items. Body: `{ action: "approve"\|"reject", ids: [...], tenant_id }` |
| `/api/outreach/templates` | `GET` | List active outreach sequences from DB |
| `/api/outreach/templates/[id]` | `PATCH` | Update template steps |
| `/api/exports` | `GET` | Stream CSV: `?dataset=leads\|outreach\|enrichments\|activities&tenant_id=...` |
| `/api/tenants` | `GET` | Returns all tenants from DB |
| `/api/pipeline/stages` | `GET/PATCH` | List or reorder pipeline stages |
| `/api/dashboard/agents/stream` | `GET` | SSE stream of `agent_runs` for the live log |

---

## 4. Python Agent — What Changed in Your Code

### `python-agent/skills/discover.py`
- **Syntax fix:** `seen_domains: = set()` → `seen_domains: set[str] = set()`. This was crashing the entire orchestrator on import.
- Summary now includes `leads_processed` and `cost_cents`.

### `python-agent/skills/score.py`
- **New pickup path:** Leads whose latest `lead_activities.created_at` is newer than the lead's `updated_at` get re-scored. This closes the "responded lead never re-scored" feedback loop.
- Helper `_has_composite()` checks if `score_breakdown.composite` exists — leads without it are picked up for re-scoring.
- Helper `_activity_driven_lead_ids()` queries recent activities and cross-references against lead timestamps.
- Summary now includes `leads_processed`, `cost_cents`, `activity_driven_candidates`.

### `python-agent/skills/draft.py`
- **DB-backed templates:** `_fetch_db_templates(tenant_id)` queries `outreach_sequences` for active templates.
- Falls back to hardcoded `TEMPLATES` dict if DB returns nothing.
- `_select_template_from_db(score, templates)` picks the template whose `score_min`/`score_max` band matches the lead's score.
- `_interpolate(body, lead)` replaces `{first_name}`, `{company_name}`, etc.
- Summary includes template usage counts.

### `python-agent/skills/enrich.py` + `enrich_gmaps.py`
- Both now import `costs.py` and include `cost_cents` and `leads_processed` in their summaries.
- Apollo enrichment: `PER_CALL_COSTS_CENTS["apollo_people_match"]` = 12 cents/call.
- Google Places: `PER_CALL_COSTS_CENTS["google_places_details"]` = 2 cents/call.

### `python-agent/skills/ghl_poll.py`
- Minor: summary includes `cost_cents: 0` (GHL polling is free at current tier).

### `python-agent/main.py`
- `log_agent_run()` now extracts `cost_cents`, `tokens_used`, `leads_processed` from skill summaries and writes them to `agent_runs`. The Economics dashboard reads these.

### `python-agent/costs.py` (NEW)
- Shared cost rate table. Mirrors `src/lib/utils/costs.ts`.
- `llm_cost_cents(model, input_tokens, output_tokens)` — call this when you use an LLM.
- `PER_CALL_COSTS_CENTS` — dict of per-API-call costs.

---

## 5. Tenant Routing

Two tenants are active:

| Tenant | UUID | Enrichment | GHL Config |
|---|---|---|---|
| Exotiq.ai | `00000000-0000-0000-0000-000000000001` | Apollo (`enrich.py`) | `GHL_API_KEY` / `GHL_LOCATION_ID` |
| MedSpa Boulder | `11111111-1111-1111-1111-111111111111` | Google Maps (`enrich_gmaps.py`) | `GHL_MEDSPA_API_KEY` / `GHL_MEDSPA_LOCATION_ID` |

`main.py` iterates both tenants every cycle. The enrichment step routes automatically based on `tenant_id`. Adding a third tenant = one DB row insert + env vars for its GHL sub-account.

---

## 6. GHL Outbound — Safety Changes

**`GHL_OUTBOUND_DRY_RUN` is now safe-by-default.** Live send only happens when `GHL_OUTBOUND_DRY_RUN` is explicitly set to `false` or `0`. Any other value (unset, empty, `true`, `yes`) = dry-run.

The outbound send (`src/lib/ghl/outbound.ts`) is triggered from the dashboard when a human clicks "Mark sent (GHL)". It is **not** called from your Python pipeline. Your `draft.py` inserts into `outreach_queue` with `status: 'pending'` — the human approval wall remains intact.

---

## 7. The `lead_activities` Column Name

The canonical column is **`activity_type`**, not `type`. When you insert into `lead_activities`, always use:

```python
db.table("lead_activities").insert({
    "tenant_id": tenant_id,
    "lead_id": lead_id,
    "activity_type": "ghl_reply",   # <-- this, not "type"
    "channel": "sms",
    "summary": "Lead replied via SMS",
    "metadata": {...},
}).execute()
```

The TypeScript `LeadActivity` interface has `activity_type` as canonical, `type` as an optional legacy alias. The `ActivityTimeline` component reads `activity_type ?? type`. New code should always write `activity_type`.

---

## 8. What Didn't Change (Your Core Loop Is Safe)

- The pipeline order: Discover → Enrich → Score → GHL Poll → Draft
- The 15-minute cron schedule
- The `schedule` library usage
- The Supabase `service_role` key (bypasses RLS — your writes still work)
- The `config.py` environment variable loading
- The `db.py` client construction
- The human-approval wall before any outreach is sent
- Discovery every 4th cycle (`RUN_DISCOVERY_EVERY_N_CYCLES = 4`)

---

## 9. New CI/CD Pipeline

GitHub Actions now runs three jobs on every push/PR:

1. **typecheck + build** — `npm run typecheck` + `npm run build`. Uploads `.next/` artifact.
2. **python-agent compile** — `python3 -m py_compile` on all `python-agent/**/*.py`. If you introduce a syntax error, this blocks the push.
3. **playwright e2e** — Downloads the build artifact, starts `next start`, runs 10 Playwright tests (5 desktop + 5 mobile) against mocked APIs.

The **pre-push git hook** also runs `python3 -m py_compile` locally. To skip: `git push --no-verify`.

---

## 10. Files You Should Know About

| File | What it is |
|---|---|
| `python-agent/costs.py` | Cost rate table — use it when logging `cost_cents` |
| `scripts/backfill_scores.ts` | Re-scores all leads via the TS scoring engine. Run with `npm run backfill-scores` |
| `scripts/seed_outreach_templates.ts` | Upserts default templates into `outreach_sequences` via REST |
| `e2e/fixtures/mockApi.ts` | Mocked API responses for Playwright — shows the exact response shapes |
| `STAGES_COMPLETE_REPORT.md` | Full audit of every PR in the epic |
| `supabase/migrations/009_*.sql` | RLS policies — read this if you hit permission errors |
| `supabase/migrations/010_*.sql` | Template seed data |

---

## 11. Quick Checklist Before Your Next Run

- [ ] Confirm `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are in your env
- [ ] Confirm `APOLLO_API_KEY` is set (for Exotiq enrichment)
- [ ] Confirm `GOOGLE_PLACES_API_KEY` is set (for MedSpa enrichment)
- [ ] Confirm `GHL_API_KEY` + `GHL_LOCATION_ID` are set (for GHL polling)
- [ ] Your `discover.py` syntax is fixed — orchestrator will start cleanly
- [ ] Templates in `outreach_sequences` table exist (seeded via migration 010)
- [ ] `agent_runs` will now show real `cost_cents` in the Economics dashboard

---

## 12. What's NOT Done Yet (Your Future Work)

- **Stage 3d: Multi-tenant SSO** — deferred, needs identity provider decision
- **Auto-send (Phase 2)** — currently all outreach requires human approval. Phase 2 will add auto-send after template trust is established. Don't implement this yet.
- **Real e2e against Supabase** — current Playwright mocks at the network layer. True end-to-end coverage with `supabase start` in CI is a future improvement.
- **Score backfill** — `npm run backfill-scores` should be run once to fix the step-function score distribution from migration data. ~70 seconds for ~700 leads.

---

*Generated from the `cursor/full-rebuild-595d` epic merge into `main`. If anything here is stale, check `STAGES_COMPLETE_REPORT.md` for the full PR-by-PR audit.*
