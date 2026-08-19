# Saul LeadGen — Comprehensive Review & Forward Roadmap

**Reviewed:** 2026-05-02
**Repo:** `exotiq-ai/lead-gen-saul` @ `main` (HEAD `7070f4f`)
**Live:** https://saul-lead.netlify.app
**Method:** Static read of every API route, lib module, dashboard page, Python skill, and migration; live HTTP probes of every dashboard route and JSON endpoint; `npm ci` + `npm run typecheck` + `npm run build` + `npm run lint` + `python3 -m py_compile` for every Python skill.

This document supersedes the in-flight `LEADGEN_BUILD_ROADMAP.md` plan. Keep that file as a source narrative; this is the corrected, fact-checked version.

---

## 1. Where the GitHub repo and the live site actually agree (and where they don't)

### 1.1 Build is shipping

`npm run build` succeeds end to end on Node 20.20.2 with the current `package.json` (Next.js `16.2.4`, React `19.2.4`, Zod `4.3.6`, `@supabase/supabase-js 2.104.x`). `npm run typecheck` passes clean — the pre-push hook is doing its job. Netlify is serving every dashboard URL (`/dashboard{,/leads,/pipeline,/scoring,/enrichment,/outreach,/agents,/economics,/settings}`) with `HTTP 200`, and every JSON endpoint I probed is alive: `kpis`, `pipeline`, `aging`, `sources`, `red-flags`, `scores`, `volume`, `economics`, `agents`, `activity`, `leads`, `outreach/queue`. So the headline claim — **"the live site is up, real data is flowing, MedSpa tenant exists"** — is accurate.

### 1.2 Phase 1–4 features that the roadmap claims as "complete" — verified

- **9-page dashboard.** All present: `src/app/dashboard/{,leads,pipeline,scoring,enrichment,outreach,agents,economics,settings}` plus dynamic `/dashboard/leads/[id]`.
- **Tenant switching.** Two tenants are real: Exotiq (`00000000-…01`, fleet/automotive) and MedSpa Boulder (`11111111-…11`). URL `?tenant=…`, `TenantGuard`, `TenantSelector`, persisted Zustand store, and a `__SAUL_TENANT_ID__` window legacy fallback all exist.
- **CSV import + per-row CSV export.** `src/components/leads/CsvImportModal.tsx` and the inline export button in `LeadsPageClient` are wired up.
- **Approval queue with edit/approve/reject/mark-sent.** `src/components/outreach/ApprovalCard.tsx` and `/api/outreach/queue/[id]` PATCH handler are implemented and behave as the spec describes.
- **GHL inbound webhook.** `src/app/api/webhooks/ghl/route.ts` does HMAC verification (`X-Saul-Hmac` header), does idempotent contact-by-`ghl_contact_id` lookup, falls back to email match, creates a lead if neither exists, and inserts a `lead_activities` row.
- **Python agent service** (`python-agent/main.py`): orchestrator that loops `discover → enrich (Apollo or Google Places) → score → ghl_poll → draft` every 15 minutes for both tenants, writes `agent_runs` rows.
- **Zod validation.** Almost every API route under `src/app/api/dashboard/*`, `/api/leads`, `/api/outreach/queue`, `/api/scoring/*`, `/api/enrichment/*` uses `parseQuery(...) / parseJsonBody(...)` from `src/lib/validation/parse.ts`. **Two routes still bypass it:** `/api/leads` POST and `/api/settings` (manual UUID regex). Worth tightening, not urgent.

### 1.3 Roadmap claims that don't survive contact with the repo

These need correcting before any new work is scoped on top of them.

| Claim in `LEADGEN_BUILD_ROADMAP.md` | Reality on `main` |
| --- | --- |
| `scripts/scripts/` exists in the workspace and needs flattening | No nested directory exists in the repo. `scripts/` is flat: `seed.ts`, `migrate.ts`, `reset-demo.ts`, `migrate_exotiq.py`, `pop_medspa.py`, `populate_medspa_leads.py`, `create_medspa_tenant.py`. The "duplicate `scripts/scripts/`" was a workspace-only artifact that already got cleaned out before HEAD. **Already fixed.** |
| `src/` "went from 7 files to 109 files" | The **repo** has 67 source files under `src/` at HEAD. The 109/7 numbers were workspace-mirror counts, not git facts. |
| GHL Sync — "Not Built. Missing webhook poller." | **GHL is built twice.** Inbound webhook at `/api/webhooks/ghl/route.ts`, *and* a 15-minute Python poller at `python-agent/skills/ghl_poll.py` (with deduplication, `last_message_date` cursor, contact resolution, inbound-bumps-status-to-engaged behavior). What's missing is **outbound** GHL — sending an approved outreach message back through GHL when "Mark sent (GHL)" is clicked. Today that button only flips `status='sent'` in the DB. |
| CSV Export tab — "Not Built" | Per-page CSV export exists on `/dashboard/leads`. There's no global "Export tab" page, but the capability is in the leads page. The **claim should be re-scoped** to "centralized exports + scheduled exports", not "CSV export needed". |
| V3 DM templates — "Not Built. Need to port the exotiq templates." | Three Exotiq templates (`tier1_proof`, `peer_intro`, `visual_fleet`) and three MedSpa templates (`website_audit`, `booking_modernization`, `before_after_gallery`) are in `python-agent/skills/draft.py` selecting by score. What's missing isn't templates per se — it's a **template registry stored in DB / `outreach_sequences` table** (which exists empty) so non-engineers can edit copy. |
| Mobile Responsive — "Currently desktop-only" | Already done in `MOBILE_BUILD_PROMPT.md`-style hamburger + breakpoints. `Sidebar.tsx` has both desktop fixed and mobile slide-in panels. The leads table hides columns at `md` and below. There are still rough edges (see §2.6). |
| Score range / lead age widgets "inaccurate" | The KPI sparklines for `active` and `velocity` come back as flat zeros from `/api/dashboard/kpis` — the issue isn't a UI bug, it's that the daily bucketing in the API only reflects last-7-days **`created_at`**, so for a stable 669-lead population the active-leads sparkline is always `[0,0,0,…]`. The KPI itself is correct, the *sparkline* is misnamed (see §2.2). |
| "0–100 score range display issue" | I see no concrete bug here in `LeadScoreCard` or `ScoreDistribution`. The actual range distribution `/api/dashboard/scores` returns is dominated by `100,93,88,80…` because Exotiq scoring buckets to a 5-tier system and many leads got 80/100 in the migration; not a display bug, a **data/scoring calibration bug** (see §2.5). |

---

## 2. Real bugs and silent failures I found

These are the items I'd merge fixes for *before* doing any new feature work. None of them are blocking the live demo, but several actively misrepresent reality on the dashboard.

### 2.1 [HIGH] Leads page renders empty because of a response-shape mismatch

`src/app/dashboard/leads/LeadsPageClient.tsx` (lines 62–80, 397–398) types the SWR response as

```ts
interface LeadsResponse { data: Lead[]; meta: { total, page, limit, totalPages, offset, red_flag_count, gregory_count, converted_this_month } }
```

and reads `data.data` and `data.meta`. **The actual `/api/leads` endpoint** (`src/app/api/leads/route.ts:118-124`) returns:

```json
{ "leads": [...], "total": 669, "page": 1, "limit": 50, "has_more": true }
```

There is no `meta` field, no `red_flag_count`, no `gregory_count`, no `converted_this_month`, no `totalPages`. So:

- The leads table almost certainly renders the empty state (`leads.length === 0` from `data?.data ?? []`).
- The stats row says `0 leads · 0 red flags · 0 Gregory leads · 0 converted`.
- Pagination is hidden (`meta?.totalPages > 1` is always false because `meta` is `undefined`).

A separate, **already-correct** `useLeads()` hook at `src/hooks/useLeads.ts` reads `data?.leads ?? []` from the same endpoint — it's just not used by the page. Fix is one of:

1. Change the API to also return `data` and `meta` objects (cleanest, preserves clients), or
2. Rewrite `LeadsPageClient` to read `data.leads`, compute pagination from `total/limit`, and add three small dashboard endpoints for `red_flag_count`, `gregory_count`, `converted_this_month` (these aren't currently aggregated server-side anywhere). I recommend **option 2** because the API shape is right; the client is wrong.

### 2.2 [HIGH] KPI "Total Active Leads" sparkline is structurally always zeros

`src/app/api/dashboard/kpis/route.ts:73-95` builds 7 daily buckets keyed by `created_at` over the last 7 days, then derives `activeSparkline = days.map(d => d.count)`. For a tenant whose 600+ active leads were almost all created weeks ago, this will be `[0,0,0,0,0,0,0]` forever. Same logic underlies `velocitySparkline` (the *velocity* number is right, but the sparkline is degenerate when the velocity is "leads created in last 7 days" and the bucket is also "leads created in last 7 days" — they're the same series, no trend visible).

Live API confirms: `"active":[0,0,0,0,0,0,0],"velocity":[0,0,0,0,0,0,0]` for Exotiq (548 active leads).

Fix: build the active-leads sparkline from a proper running count (`count of active leads at end of each day`) instead of `count(created_at = day)`. Do that against `created_at` and `status_changes` if you keep status history; otherwise approximate using `created_at - converted_at` semantics.

### 2.3 [HIGH] `python-agent/skills/discover.py` does not parse — discovery is broken

Line 88:

```py
seen_domains: = set()
```

is invalid Python. `python3 -m py_compile python-agent/skills/discover.py` errors out with `SyntaxError: invalid syntax`. So if the agent service ever attempts to import the skill (it does, at the top of `main.py:32`), the *entire orchestrator* will crash on startup. This is also why the agents dashboard shows zero runs and `last_run_at: null` for every agent.

Fix:

```py
seen_domains: set[str] = set()
```

### 2.4 [HIGH] `/api/leads` POST will reject every CSV import row because of phantom columns

`src/app/api/leads/route.ts:163-181` inserts these columns into `leads`:

```ts
{ tenant_id, company_name, first_name, last_name, email, phone,
  city, state, source, status, assigned_to, score, red_flags, tags, metadata }
```

But migration `001_core_schema.sql` defines `leads` with **no** `city`, **no** `state`, **no** `tags`, and **no** `metadata` columns. (There's a `metadata` column on `lead_activities`, not on `leads`.) So either:

- The CSV import has been silently failing in production on Postgres, or
- A migration that added these columns exists but isn't checked into `supabase/migrations/`.

Production payloads coming back from `/api/leads` confirm the second hypothesis: Exotiq leads include `metadata` (`booking_system`, etc.) embedded inside `score_breakdown` JSON, which suggests the team kept the schema lean and the `tags`/`city`/`state`/`metadata` fields are just dead in the POST handler and need to be removed.

Fix: drop those four fields from the insert object **or** add a `00X_lead_extras.sql` migration that adds them properly. Whichever you pick, also fix `LeadRow.tsx` (lines 89, 93, 94) which reads `lead.city`, `lead.state`, `lead.metadata.industry`, `lead.metadata.fleet_tier` — none of which the `/api/leads` GET returns either.

### 2.5 [MED] Score distribution is an artifact of the migration, not real signal

`/api/dashboard/scores` returns blocks of `100, 100, 100, …` (17 of them), then `93×8`, `88×7`, `80×31`, etc. That's because:

- The Exotiq migration in `scripts/migrate_exotiq.py` mapped 5-tier ratings to `5→100, 4→80, 3→60, 2→40, 1→20`.
- The TS scoring engine then re-computes scores from `score_breakdown` plus engagement, but only for leads that actually go through `/api/scoring/calculate`.
- The bulk of Exotiq leads still carry their migration-assigned scores, so the distribution looks like a step function.

Fix: a one-time backfill script that runs `calculateScore()` for every lead and writes a real composite. Today the only path to a real score is through the scheduled python agent, which only scores `status='enriching'` leads (skipping the migrated ones in `engaged`/`scored`/etc.).

### 2.6 [MED] Pipeline funnel is empty — wrong table assumption

`/api/dashboard/pipeline` returns `{"stages": []}` for both tenants. The route falls back to status-grouping only when `pipeline_stages` is empty, but the **filter** uses `not('status', 'in', '(lost,disqualified)')` — that part works. The reason stages comes back `[]` is the route is hitting the *real* `pipeline_stages` table without filtering by tenant. There are MedSpa stages and Exotiq stages that overlap in name; without a `WHERE tenant_id = ?` clause the stage iteration sees one tenant's stages but the lead `stage_id` references the other tenant's IDs, so `stageMap[sid]` always misses. (See `src/app/api/dashboard/pipeline/route.ts:15-19`: the SELECT has no `eq('tenant_id', tenantId)`.)

Fix: add `eq('tenant_id', tenantId)` to the `pipeline_stages` SELECT. This is a tenant-isolation bug as well as a UX bug — Exotiq leads were briefly visible to MedSpa users through this leak before the latest commit closed most cross-tenant gaps; this one slipped through.

### 2.7 [MED] React "set state in effect" lint errors will become real bugs in React 19 strict mode

`npm run lint` reports 6 errors, all `react-hooks/set-state-in-effect`:

- `src/app/dashboard/economics/EconomicsPageClient.tsx:305`
- `src/app/dashboard/leads/LeadsPageClient.tsx:374` (the page-reset effect)
- `src/app/dashboard/settings/SettingsPageClient.tsx:51`
- `src/components/charts/LeadAging.tsx:159, 204` (`@ts-ignore` should be `@ts-expect-error`)
- `src/components/charts/ScoreDistribution.tsx:172` (same)

The `set-state-in-effect` ones cause cascading renders today and will fail more aggressively under React 19's compiler. Move state derivations into render bodies (`const page = useMemo(...)`) or out into event handlers.

### 2.8 [MED] RLS on outreach is JWT-claim-based, but the app talks to Supabase as the service role

Migrations 002 and 006 install policies of the form `tenant_id = (auth.jwt() ->> 'tenant_id')::UUID` for tenant isolation. Migration 008 then drops the original `anon` SELECT policies and replaces them with bare `GRANT SELECT … TO anon`, **which means any anon-keyed reader on the public Supabase project can read every tenant's leads, activities, outreach queue, etc.** The Next.js server uses the *service role* key (per `src/lib/supabase/server.ts`), so policy enforcement isn't really happening — tenant isolation is enforced *only* at the API boundary by adding `eq('tenant_id', tenantId)` to every query.

In practice today:

- The recent commit `7070f4f` ("eliminate cross-tenant data leakage") fixed several places where this was missing.
- §2.6 above is one of the few remaining gaps.
- The bigger latent risk: if the web client is ever migrated from "read JSON via Next.js API" to "read directly via supabase-js with anon key" (as the seed/`scripts/seed.ts` style uses), every tenant's data is exposed.

Fix path (in priority order):

1. Audit every `from('…').select(...)` in `src/app/api/**` — confirm all paginated and aggregating queries have `eq('tenant_id', tenantId)` (and add it to the pipeline route per §2.6).
2. Replace migration 008's bare `GRANT SELECT … TO anon` with a proper policy keyed by a `tenant_id` query parameter or a JWT custom claim. While we're single-app, a temporary `GRANT SELECT … TO anon` restricted to a `tenant_views` schema (where each view filters by a session var) is a defensible middle ground.
3. Long-term, when SSO arrives (Phase 5c), migrate to JWT `tenant_id` claim and let RLS do the work.

### 2.9 [LOW] Two duplicate Zustand stores for the same dashboard state

`src/lib/store/dashboardStore.ts` re-exports from `src/stores/dashboardStore.ts` — that file says "Always import from @/stores/dashboardStore directly when possible", but both paths are still imported across the codebase (e.g. `src/app/dashboard/DashboardClient.tsx:15` uses the `lib/store` path while `src/components/dashboard/TopBar.tsx:7` uses the `stores` path). They resolve to the same module today; if anyone ever forgets the re-export, you get split state. Delete `src/lib/store/dashboardStore.ts` and update imports.

### 2.10 [LOW] Aging "active" bucket is structurally zero for all leads with `last_activity_at = null`

`/api/dashboard/aging/route.ts:11` falls back to `created_at` when `last_activity_at` is null, then anything older than 7 days lands in `cooling`/`stale`/`dead`. The 669 Exotiq leads were almost all created in early April with no activity timestamps, so the `active` bucket is structurally 0. That's not a code bug, but the *narrative* the chart tells (no active leads at all) is wrong. Either:

- Backfill `last_activity_at = created_at` for new leads at insert time, **or**
- Render the chart as "Lead age (since creation)" when `last_activity_at` is universally null.

### 2.11 [LOW] Misleading agent dashboard

`/api/dashboard/agents` returns `gateway.status: 'online'`, `gateway.last_heartbeat: now()`, `gateway.protocol: 'OpenClaw WebSocket (Gateway)'` no matter what. There is no actual gateway connection check — the values are hard-coded, so the dashboard shows "Saul is online" even when the python service isn't running. With §2.3 broken, this is actively lying to the user. Either remove the gateway tile or make `last_heartbeat` come from the most recent `agent_runs.completed_at` only (which is what `lastHeartbeat` *almost* does, except the fallback to `new Date().toISOString()` papers over the missing data).

### 2.12 [LOW] Sources chart has a label collision

`/api/dashboard/sources` returns both `"apollo"` (199) and `"Apollo Outbound"` (168). The `SOURCE_LABELS` map in `route.ts:8-14` only translates `outbound → 'Apollo Outbound'`, so the lowercase `apollo` source is rendered as `"apollo"` while another bucket of identically-meaning leads is rendered as `"Apollo Outbound"`. Same campaign, two slices of the pie. Normalize source values at write time, or in the route map both to a single label.

---

## 3. Net assessment

The system **is** in better shape than the roadmap implies — most of what the roadmap calls "not built" is built — but it has a layer of "looks-right-from-the-outside" bugs that would erode trust the moment Gregory or a paying client clicks past the overview page. Specifically:

- The leads page renders empty (§2.1).
- The KPI sparklines are flat (§2.2).
- The pipeline funnel is empty (§2.6).
- The agent dashboard says "online" while the Python service has a syntax error preventing it from running (§2.3, §2.11).

These are 4 real, fixable bugs that would take a focused day of engineering each. They sit between you and a credible production-ready demo. I'd sequence them ahead of anything net-new.

Otherwise: the schema is solid, RLS is mostly-OK as long as we keep going through the API layer, the python skill set is well-factored, and the UI is mature.

---

## 4. Forward roadmap (post-correction)

Rewritten from scratch, dropping calendar estimates because cloud-agent execution is not measured in days. Each item has a **scope** (which subsystems are touched), a **dependency chain**, and a **risk** rating. Workstreams are designed to run in parallel on separate `cursor/` branches and merge through PRs.

### Stage 0 — Truth-restoring bug fixes (must precede anything else)

These four bugs all exist today and they each independently break a high-traffic part of the dashboard. They share no dependencies and can be a single PR or four small ones.

- **0a — Fix leads page response-shape mismatch.** Touches: `src/app/api/leads/route.ts`, `src/app/dashboard/leads/LeadsPageClient.tsx`. Risk: low. Add a server-side aggregate for `red_flag_count / gregory_count / converted_this_month` so the stats row stops lying.
- **0b — Fix KPI sparkline semantics.** Touches: `src/app/api/dashboard/kpis/route.ts`. Risk: low. Switch `active` sparkline to a running daily count of active leads; switch `velocity` sparkline to a 14-day rolling diff.
- **0c — Fix pipeline tenant isolation.** Touches: `src/app/api/dashboard/pipeline/route.ts` (one line), all other `/api/dashboard/*` routes (audit). Risk: low if we just add `eq('tenant_id', tenantId)`; we should also write a small test that calls every dashboard endpoint for one tenant and asserts no row references another tenant's IDs.
- **0d — Fix python-agent syntax error + add CI gate.** Touches: `python-agent/skills/discover.py:88`, plus a new `.github/workflows/python-agent.yml` running `python -m py_compile` on every `python-agent/**/*.py` (and ideally `ruff check`). Risk: low. This is the kind of error a `pre-push` Python equivalent of `npm run typecheck` would have caught — recommend mirroring the TS approach in `.githooks/pre-push`.

### Stage 1 — Production hardening

- **1a — CSV import: fix phantom columns.** Touches: `src/app/api/leads/route.ts` POST, `src/components/leads/CsvImportModal.tsx`, `LeadRow.tsx`. Risk: low. Remove `city/state/tags/metadata` from inserts (or add columns via a new migration if those fields are wanted long-term).
- **1b — Outbound GHL: actually send when "Mark sent (GHL)" is clicked.** Touches: a new lib `src/lib/ghl/outbound.ts`, `/api/outreach/queue/[id]` PATCH handler. Risk: medium — needs a GHL Conversations API token and rate-limiting (100 calls / 10 sec). Keep dry-run mode behind `GHL_OUTBOUND_DRY_RUN=true` so it can be merged before real creds land.
- **1c — Tenant-aware RLS.** Touches: `supabase/migrations/009_tenant_views_or_jwt.sql` (new), `src/lib/supabase/{client,server}.ts`. Risk: medium. Two viable shapes — (a) a `tenant_views` schema with `SECURITY DEFINER` views and a `set_tenant(uuid)` RPC, or (b) JWT custom claim `tenant_id`. Pick (b) once SSO is in scope.
- **1d — Score backfill.** Touches: a new `scripts/backfill_scores.ts` that calls `calculateScore()` for every lead; **and** a guard in `python-agent/skills/score.py` that picks up leads whose `score_breakdown` has no `composite` set, regardless of status. Risk: medium — re-scoring 669 leads is fine; doing it during peak GHL inbound could starve other writes; rate-limit to ~10 per second.
- **1e — Drop set-state-in-effect lint errors.** Touches: 3 page clients + 2 chart components. Risk: low. Tracked separately because it gates a clean lint baseline before we adopt any stricter config.
- **1f — Consolidate Zustand stores.** Touches: ~10 import sites. Risk: trivial. Delete `src/lib/store/dashboardStore.ts`, codemod imports.

### Stage 2 — Operator features the team has actually asked for

- **2a — DB-backed outreach templates.** Touches: `supabase/migrations/00X_outreach_templates.sql` (use the existing `outreach_sequences` table), `src/app/dashboard/outreach/templates/...` (new editor page), `python-agent/skills/draft.py` (read templates from DB). Risk: medium. Replaces hard-coded templates with a registry an SDR can edit; the variable interpolation contract (`{first_name}`, `{company_name}`, `{booking_note}`) becomes a typed DB schema.
- **2b — "Approve all" + bulk actions on `/dashboard/outreach`.** Touches: `OutreachPageClient.tsx`, `/api/outreach/queue/[id]` PATCH (extend to accept array of IDs in a sibling `/api/outreach/queue/bulk` endpoint). Risk: low.
- **2c — Real export center.** Touches: a new `/dashboard/exports` page + `/api/exports/{leads,outreach,enrichments}.csv` server-streaming endpoints (use `Response` with a `ReadableStream` and chunked CSV). Risk: low. Replaces the per-page "Export CSV" with a unified hub that supports filters and emits proper UTF-8 BOM for Excel.
- **2d — Activity-driven re-scoring.** Touches: `python-agent/skills/score.py` (today only re-scores leads whose status is `enriching`). Make it also pick up leads whose latest `lead_activities` row is newer than `scored_at`/`updated_at`. Risk: low. This closes the "feedback loop" the master prompt describes but the code doesn't actually implement.
- **2e — Agent dashboard truthfulness.** Touches: `/api/dashboard/agents/route.ts`. Risk: trivial. Drop the hard-coded `online` status; use `(now - lastHeartbeat) < 30min` as the live test; expose pipeline-stage durations from `agent_runs.duration_ms` so we can spot which step is slow.

### Stage 3 — Multi-tenant scaling and observability

- **3a — Tenant catalog as DB-driven.** Today `TENANTS` is hard-coded in `src/lib/hooks/useTenant.ts` with literal UUIDs. Migrate to a `/api/tenants` route reading from `tenants` table, and seed Exotiq + MedSpa via migration so we can onboard a third tenant by inserting a row, not by deploying. Risk: low.
- **3b — Tenant-scoped pipeline stages.** The `pipeline_stages` table is correct; the API just needs to filter on `tenant_id`. Combined with §0c. Once that's done, allow stages to be reordered from `/dashboard/settings`. Risk: low.
- **3c — Cost attribution.** `agent_runs.cost_cents` exists but is unset everywhere. Wire up Apollo's per-call cost (already in `src/lib/enrichment/apollo.ts`), Google Places ($0.02 per detail), and Anthropic token cost (`src/lib/utils/costs.ts`) into `agent_runs.cost_cents` so `/dashboard/economics` stops mixing real numbers with `generateDemoTokenData()`. Risk: medium (touches every skill).
- **3d — SSO + tenant_id JWT claim.** Touches: Supabase auth, `src/middleware.ts` (new). Risk: high. Defer until 3a and 3b are done.

### Stage 4 — Stretch and polish

- **4a — End-to-end test harness.** Playwright tests that walk discover → enrich → score → draft → approve for one synthetic tenant in CI. Today there are zero tests in the repo.
- **4b — Lead detail page polish.** `src/app/dashboard/leads/[id]/LeadDetailClient.tsx` is 39KB; split into composable subcomponents and lazy-load the activity timeline.
- **4c — Live agent log viewer.** Stream `agent_runs.output_data` JSON-lines into the agents page so an operator can watch a cycle execute.
- **4d — Mobile QA pass.** The mobile work landed but the lead-detail and approval-card flows still feel desktop-shaped on iPhone SE; tighten paddings and stack action rows.

---

## 5. Git workflow recommendation

This block is the only meaningful disagreement I have with the existing `LEADGEN_BUILD_ROADMAP.md` git section, which says "all changes reviewed before merge". For an autonomous-agent repo that already has a passing pre-push typecheck, the friction-minimal version is:

- **One PR per Stage 0/1 item.** Small, reversible, easy to roll back from Netlify if needed.
- **Stage 2+ goes branch-per-workstream**, matching the original `MASTER_PROMPT_V2` philosophy: `cursor/2a-outreach-templates-XXX`, etc. Each branch lives until it lands, including any follow-up bugfixes.
- **Pre-push typecheck stays as the only required gate.** Add a `pre-push` Python check (`python -m py_compile python-agent/**/*.py`) so we never ship a Python skill that fails to import again — that's the lesson of §2.3.
- **Add a tiny smoke-test workflow:** `.github/workflows/smoke.yml` running `npm ci && npm run build && npm run typecheck` on PR. CI is currently absent; a 90-second build job prevents the type of "main is green locally, broken on Netlify" drift the roadmap was worried about.
- **Don't auto-merge.** Cloud agents should always create draft PRs; humans flip to non-draft.

---

## 6. What changed in this commit

This branch (`cursor/review-and-roadmap-595d`) only adds this `REVIEW_AND_ROADMAP.md`. No code changes. Each Stage 0/1 fix will land on its own branch as a follow-up so they can be reviewed independently.
