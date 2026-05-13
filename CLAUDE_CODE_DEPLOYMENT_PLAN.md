# Claude Code Sessions — Deployment Plan for Saul's Python Agent

**Date:** 2026-05-13
**Replaces:** OpenClaw agent service
**Goal:** Run the Saul Python pipeline (discover → enrich → score → draft → ghl_poll → insights) on a persistent, scheduled Railway service that costs ~$3-5/day and requires zero babysitting.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Railway                                  │
│                                                                   │
│  ┌─────────────┐    schedule: */15 * * * *  ┌──────────────────┐ │
│  │  Railway    │ ───────────────────────── │  saul-agent      │ │
│  │  cron       │                            │  (Docker)        │ │
│  └─────────────┘                            │                  │ │
│                                             │  Skills:         │ │
│                                             │  • discover      │ │
│                                             │  • enrich        │ │
│        ┌──────────────────────┐             │  • score         │ │
│        │  Anthropic SDK       │◄────────── │  • draft         │ │
│        │  (insights skill)    │             │  • ghl_poll      │ │
│        │  Haiku 4.5 + caching │             │  • insights ←LLM │ │
│        └──────────────────────┘             └──────────────────┘ │
│                    │                                  │           │
└────────────────────│──────────────────────────────────│───────────┘
                     │                                  │
                     ▼                                  ▼
            api.anthropic.com                   Supabase (DB)
            (Claude Haiku 4.5)                  + GHL APIs
                                                + Apollo / Google Places
                                                + Next.js API on Netlify
```

The agent is a one-shot Docker container: each cron tick starts the
container, runs one pipeline cycle for every tenant, writes `agent_runs`
+ `agent_insights` rows to Supabase, and exits. No long-running process
holding state, no in-memory counters that reset between invocations.

---

## Phase 1: Hosting (Railway)

Railway is already provisioned and connected to the GitHub repo.

1. In the Railway project, create a service from this repo and set the
   **root directory** to `python-agent/`. Railway will detect the
   Dockerfile and build automatically.
2. Add the environment variables in **Phase 4** below.
3. Configure the service as a **cron schedule** (Railway → service →
   Settings → Cron Schedule). Use `*/15 * * * *`. Railway runs the
   container's `CMD` (`python main.py --once`) on that schedule and
   stops the container when it exits — no idle compute charges.
4. Verify auto-deploys are wired to `main` (default Railway behavior
   when you select a repo).

Other providers (Fly.io, DigitalOcean) remain viable but are not the
current path; the Dockerfile is portable if we want to switch later.

---

## Phase 2: Pipeline Code (Done On Branch `claude/review-lead-gen-changes-QEQFz`)

These changes are implemented on the working branch and ready to merge:

### 2a. `--once` invocation mode (`main.py`)

`main.py` now exposes:

```
python main.py            # default: one cycle for all tenants, then exit
python main.py --once     # explicit one-shot (same as default)
python main.py --loop     # legacy in-process 15-min schedule for local dev
```

The Dockerfile `CMD` is `python main.py --once`. Local dev keeps
working via `python main.py --loop`.

### 2b. DB-driven discovery cadence

The previous orchestrator used a module-global `_cycle_count` to gate
discovery (`% 4 == 1`). Under cron that counter resets every invocation,
which meant discovery either fired every tick or never fired depending
on tenant ordering.

`skills/discover.py` now consults Supabase: it reads the latest
successful `agent_runs` row for `agent_type='sourcing'` for this tenant
and skips if the last run is younger than `DISCOVERY_MIN_INTERVAL_SECONDS`
(default 3600 = once per hour).

### 2c. MedSpa discovery short-circuit

`skills/discover.py` only searches for exotic-car-rental operators, which
is wrong for the MedSpa tenant. The skill now early-returns for the
MedSpa tenant ID and emits a `skipped` summary instead of issuing
useless web queries. MedSpa grows via CSV import + Google Places
enrichment until we ship a dedicated `discover_gmaps.py`.

### 2d. Daily Apollo budget cap

`skills/enrich.py` now sums `agent_runs.cost_cents` for this tenant
since UTC midnight and skips dispatch when the daily cap is reached.

Default cap: **`APOLLO_DAILY_BUDGET_CENTS=1000`** ($10/day per tenant,
~80 enrichments at 12¢/call). Set to `0` to disable.

### 2e. `APP_BASE_URL` fail-fast + startup health check

`config.py` exposes `check_required_config(strict=True)` which now
rejects `APP_BASE_URL` values that still point at `localhost` when
running in cron mode.

`main.py` calls a startup health check that:
- validates required env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  non-localhost `APP_BASE_URL`),
- pings Supabase with a cheap count query,
- soft-warns if the Next.js API at `APP_BASE_URL` is unreachable
  (we use `/api/dashboard/kpis` as the probe; soft-warn rather than
  fail because enrich/score will surface failures explicitly).

A hard check failure in `--once` mode aborts with exit code 1, which
Railway surfaces as a failed cron run.

### 2f. Insights LLM: Anthropic Haiku 4.5 with tool-use + prompt caching

`skills/insights.py` is migrated off raw HTTP-to-OpenAI to the Anthropic
SDK:

- Default model: **`claude-haiku-4-5-20251001`** (override via `INSIGHTS_MODEL`).
- **Tool-use** for every insight type — the model is forced to call a
  named tool with a JSON schema, so we never parse freeform JSON. Each
  insight type (reply analysis, dead-lead diagnosis, new-lead assessment,
  draft-quality review, daily narrative) has its own tool schema.
- **Prompt caching** (`cache_control: ephemeral`) on the shared Saul
  persona system prompt; Anthropic charges 0.25× on cache hits, which
  cuts insight costs substantially across a multi-tenant cycle.
- Real cost tracking: every call goes through `costs.py:llm_cost_cents`
  and the totals are returned in the skill summary so
  `/dashboard/economics` sees real numbers.
- OpenAI gpt-4o-mini is kept as a fallback (used automatically when
  `ANTHROPIC_API_KEY` is absent but `OPENAI_API_KEY` is set), with
  `response_format=json_object`.

### 2g. Dockerfile + requirements

- `python-agent/Dockerfile` (python:3.12-slim) builds the image Railway
  deploys.
- `requirements.txt` drops the unused `apollo` package (which clashed
  with the Apollo API name and isn't actually imported anywhere),
  adds `anthropic>=0.40`, and keeps `schedule` for `--loop` mode.

---

## Phase 3: Future — Claude Agent SDK orchestration (Deferred)

The realistic Agent-SDK upgrade is to replace the insights skill's
direct API calls with the SDK so we can use tool-use loops and
multi-turn reasoning if we ever want to (e.g. "fetch the lead's
history, then classify"). That's a non-breaking evolution because the
JSON contract returned to `_write_insight` stays the same.

We are explicitly **not** going down the "let Claude decide which
pipeline steps to run" path. For a deterministic 15-minute cron, that
adds variance and cost without adding value.

---

## Phase 4: Environment Variables

Set on the Railway service:

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL` | ✅ | `https://qbvkisrazmipmwlejqtf.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Bypasses RLS — required for writes |
| `APP_BASE_URL` | ✅ | **Must not be localhost.** Set to `https://leadsbysaul.netlify.app` |
| `APOLLO_API_KEY` | ✅ for Exotiq | Apollo enrichment |
| `GOOGLE_PLACES_API_KEY` | ✅ for MedSpa | Google Places enrichment |
| `GHL_API_KEY` + `GHL_LOCATION_ID` | ✅ | Exotiq GHL polling/sending |
| `GHL_MEDSPA_API_KEY` + `GHL_MEDSPA_LOCATION_ID` | ✅ | MedSpa GHL polling/sending |
| `ANTHROPIC_API_KEY` | ✅ | Insights LLM (Haiku 4.5) |
| `INSIGHTS_MODEL` | optional | Default `claude-haiku-4-5-20251001` |
| `INSIGHTS_ENABLED` | optional | Default `true`; kill switch |
| `APOLLO_DAILY_BUDGET_CENTS` | optional | Default `1000` (=$10/day/tenant) |
| `DISCOVERY_MIN_INTERVAL_SECONDS` | optional | Default `3600` (1 hour) |
| `GHL_OUTBOUND_DRY_RUN` | ✅ | **Keep `true` during burn-in.** Flip to `false` only after sign-off |
| `OPENAI_API_KEY` | optional | Fallback if Anthropic key is absent |

---

## Phase 5: Migrations (Human Task)

Run these in the Supabase SQL editor — they are pre-reqs for the agent
to function correctly on first launch:

1. `supabase/migrations/009_tenant_views_and_grants.sql` — tenant-aware RLS
2. `supabase/migrations/010_outreach_templates_seed.sql` — without this,
   `draft.py` falls back to hardcoded templates
3. `supabase/migrations/011_agent_insights.sql` — without this, the
   insights skill throws on every cycle

Verify after applying:

```sql
SELECT COUNT(*) FROM outreach_sequences;  -- > 0
SELECT COUNT(*) FROM agent_insights;      -- 0 until agent runs (table just needs to exist)
```

Then run the one-time score backfill from the project root:

```bash
npm run backfill-scores
```

(Requires `SUPABASE_SERVICE_ROLE_KEY` locally. ~70s for ~700 leads.)

---

## Phase 6: Monitoring & Observability

### Already exists
- `agent_runs` table logs every skill execution (duration, cost, leads processed)
- `/dashboard/agents` shows gateway status + recent runs
- SSE stream of live agent runs

### To add (TODO, not blocking)
- Netlify scheduled function that queries `agent_runs` every 10 minutes
  and alerts (Slack/email) if the most recent successful run is > 30
  minutes old. ~40 lines.
- Weekly cost summary from `agent_runs.cost_cents` aggregation.

---

## Cost Projections

| Component | Cost/Day | Cost/Month |
|---|---|---|
| Railway cron container | ~$0.15 | ~$5 |
| Anthropic Haiku 4.5 (insights, with caching) | ~$0.10 | ~$3 |
| Apollo API (capped at $10/day per tenant) | $0-$10 | ≤$300 (hard ceiling) |
| Google Places (MedSpa enrichment) | ~$0.40 | ~$12 |
| GHL API | $0 | $0 |
| **Typical day total** | **~$2-4** | **~$60-150** |
| **Worst case (both Apollo caps maxed)** | **~$20** | **≤$600** |

The Apollo cap is the dominant variance. $10/day per tenant is the
burn-in default; raise via `APOLLO_DAILY_BUDGET_CENTS` once we have a
month of data.

---

## Migration Timeline

| # | Owner | Task |
|---|---|---|
| 1 | Agent (done) | Code changes 2a–2g on `claude/review-lead-gen-changes-QEQFz` |
| 2 | Human | Apply migrations 009, 010, 011 to Supabase |
| 3 | Human | Run `npm run backfill-scores` once |
| 4 | Human | Merge branch to `main` (PR or direct push, your call) |
| 5 | Human | In Railway: set env vars (Phase 4), service root = `python-agent/` |
| 6 | Human | In Railway: set cron schedule `*/15 * * * *` |
| 7 | Both | Watch first 24h with `GHL_OUTBOUND_DRY_RUN=true`. Verify `agent_runs` rows every 15 min, both tenants, no `status='failed'` patterns |
| 8 | Human | Sign off (Gregory ± Ariella) and flip `GHL_OUTBOUND_DRY_RUN=false` |
| 9 | Human | Cancel OpenClaw, remove OpenClaw webhook URLs from GHL |
| 10 | Agent (next PR) | Health-check Netlify scheduled function for stalled-pipeline alerts |

---

## Rollback Plan

If the agent misbehaves in production:

1. **Soft stop:** in Railway, disable the cron schedule. The container
   stops invoking; existing `agent_runs` data is preserved.
2. **Insights-only stop:** set `INSIGHTS_ENABLED=false` to disable the
   LLM-touching step while the rest of the pipeline keeps running.
3. **Hard stop:** set `GHL_OUTBOUND_DRY_RUN=true` to make sure no
   approvals translate to real sends, even if someone clicks Approve.
4. **Revert:** the previous OpenClaw deployment can be re-enabled
   independently until Phase 8 of the timeline is complete.
