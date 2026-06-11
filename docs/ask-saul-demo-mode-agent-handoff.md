# Handoff: Finish, Test, and Deploy Saul Demo Mode (staging)

Agent: Avi.
Repo: `exotiq-ai/lead-gen-saul`, branch **`claude/stoic-hypatia-hl3t32`** — work and push ONLY on this branch. Do not open a PR, do not merge, do not push to `main`.
Owner: Gregory Ringler (final say on anything production-facing).

## Your mission

The demo-mode voice agent is **fully built and code-reviewed** in `voice-agent/`.
Your job is the last mile: verify the build on this machine, finish the staging
worker setup with the credentials you've been given, run the live-LLM test
suite, stand up the cloned ElevenLabs staging agent, and get everything ready
for Gregory's 10-call validation — then prepare (but do NOT execute) the
production cutover.

Read these three docs before touching anything, in this order:

1. `docs/ask-saul-demo-mode-cutover-runbook.md` — the operational steps. This is your primary checklist; Part 0 and Part 1 are partially done (see "Current state" below).
2. `docs/ask-saul-prospector-demo-mode-plan.md` — the design spec (3-state hat-switch machine, tool gating, sentinels, fail-open rules). You need this to judge whether behavior you observe is correct.
3. `voice-agent/README.md` + the source in `voice-agent/src/` — small codebase (~12 files); read all of it.

## What's already true (verified — don't redo, do trust)

- 41/41 `node:test` tests pass; `tsc --noEmit` clean in `voice-agent/` and repo root.
- `wrangler deploy --dry-run` bundles cleanly for both the default (prod) and `--env staging` configs.
- An adversarial code review found no blockers; all 8 findings are fixed and pinned by tests (state continuity without KV, `elevenlabs_extra_body.conversation_id` call-id resolution, fail-closed post-call webhook, loop-exhaustion wrap-up, sentinel fail-open, scripted demo offer, stream error path, trailing-assistant prefill guard).
- **Production KV namespace exists and is wired**: binding `SAUL_CALL_STATE`, id `979e9f93f6e2438f946ca5c9cf735e9f`, already in `wrangler.toml`.
- **Staging KV namespace exists but is NOT wired**: title `staging-SAUL_CALL_STATE` in Gregory's Cloudflare account; its id is unknown. The `[[env.staging.kv_namespaces]]` block in `wrangler.toml` is commented out awaiting that id.
- No staging secrets have been set. The staging worker has never been deployed. No ElevenLabs clone exists yet.

## Credentials you'll be given, and the only things to use them for

| Credential | Use for | Never for |
|---|---|---|
| Cloudflare (wrangler auth / API token) | `kv namespace list`, staging secrets, `wrangler deploy --env staging`, `wrangler tail --env staging` | Deploying the default (production) worker, touching other workers |
| Anthropic API key | Staging worker secret; running `npm run simulate` locally | Committing it anywhere; raising spend beyond test calls |
| Supabase URL + service role key | Staging worker secrets; verifying staged rows land (`leads.source = 'saul_phone_agent_staging'`, `lead_activities`, `agent_runs`) | Writing/altering any non-staging-tagged data; schema changes |
| ElevenLabs account/API access | Cloning the prod Saul agent into a staging agent; pointing its Custom LLM at the staging worker; enabling "Custom LLM extra body"; wiring the post-call webhook; test calls | Modifying the PRODUCTION ElevenLabs agent or its phone number in any way |
| (If provided) GHL key | NOT NEEDED. Do not set it on staging | Everything |

Secrets go in via `npx wrangler secret put <NAME> --env staging` only — never
into `wrangler.toml`, `.dev.vars` committed files, code, commits, or logs.

## Task list (in order, with gates)

### 1. Verify the build locally (~10 min)

```sh
cd voice-agent && npm ci && npm run typecheck && npm test
npx wrangler deploy --dry-run --outdir /tmp/wb
npx wrangler deploy --dry-run --outdir /tmp/wbs --env staging
```

Gate: 41 tests pass, both dry-runs bundle. If anything fails, stop and report
— don't patch around it.

### 2. Wire the staging KV id

`npx wrangler kv namespace list` → find title `staging-SAUL_CALL_STATE` → paste
its id into the commented `[[env.staging.kv_namespaces]]` block in
`voice-agent/wrangler.toml`, uncomment it, commit, push.

### 3. Staging secrets + deploy

Per runbook §1.2: `ANTHROPIC_API_KEY`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and a freshly generated
`ELEVENLABS_SHARED_SECRET` (record it — you need the same value in step 5).
Then `npx wrangler deploy --env staging` and gate on
`curl <staging-url>/health` → `{"ok":true,...}`.

### 4. Run the LLM simulator and commit the evidence

```sh
ANTHROPIC_API_KEY=... npm run simulate
```

This drives three full simulated calls (clean funnel, demo refusal, mid-demo
derail) against the worker in-process, dry-run, and writes annotated
transcripts to `voice-agent/test/simulated-calls/*.md`. Read all three
transcripts critically against the spec: mode annotations must follow
discovery → demo → debrief; the demo persona must never quote real prices or
mention Gregory; the derail scenario must exit the role-play immediately; the
reverse close ("Is there any reason an agent like this wouldn't work for your
business?") must appear at most once. Commit the transcripts and push. If a
transcript shows a prompt-level flaw, fix the prompt in
`voice-agent/src/prompts.ts`, re-run tests + simulator, and document the
change. Behavior > elegance.

### 5. Stand up the ElevenLabs staging agent

Runbook §1.4–1.5, with your API access: duplicate the production Saul agent →
name it `Saul Demo Staging` → Custom LLM URL = staging worker URL, auth =
the `ELEVENLABS_SHARED_SECRET` from step 3 (Bearer) → **enable "Custom LLM
extra body"** (the worker reads `elevenlabs_extra_body.conversation_id`; this
is what makes KV mode state work) → attach a test number or use dashboard test
calls → post-call webhook: set `ELEVENLABS_POST_CALL_SECRET` on staging FIRST
(endpoint returns 503 until it's set — that's intentional), then add the
webhook URL `<staging-url>/webhooks/elevenlabs-post-call`.

### 6. End-to-end staging verification

Make (or have Gregory make) test calls per the runbook Part 2 checklist. While
calls run, watch `npx wrangler tail --env staging` and confirm: stable call id
across turns (NOT a fresh UUID per turn — if UUIDs, "extra body" isn't enabled),
mode transitions, no errors. After calls confirm in Supabase: staged lead rows,
`demo_started`/`demo_completed` activities, transcript rows in `agent_runs`.
Confirm NOTHING appeared in real GHL/SMS/Telegram. Measure feel: first words
within ~1s of turn end; if sluggish, test `PRIMARY_MODEL=claude-haiku-4-5` on
staging and report the comparison rather than silently switching.

### 7. Prepare — do not execute — production cutover

Write up the exact remaining cutover steps (runbook Part 3) with current URLs
and any deltas you discovered. **Production cutover requires Gregory's explicit
go.** Do not deploy the default environment, do not touch the production
ElevenLabs agent.

## Hard rules

- Branch `claude/stoic-hypatia-hl3t32` only; commit incrementally; push when green; no PRs.
- `npm run typecheck` + `npm test` must pass before every push (root `npm run typecheck` too if you touch anything outside `voice-agent/`).
- Never relax the safety mechanisms: tool gating (demo mode = `end_demo_roleplay` only), dry-run on staging, fail-closed webhook, fail-open-to-discovery mode resolution.
- If ElevenLabs' current UI/API doesn't match the runbook's wording, trust the goal (clone agent → point at staging URL → extra body on → webhook signed) over the exact menu names, and update the runbook with what you actually found.
- Anything ambiguous about production, money, or customer-visible behavior: stop and ask Gregory.

## Definition of done + report

Done = steps 1–6 complete with evidence, step 7 written, everything pushed.
Final report must state, in plain sentences: (a) what you verified with
evidence (test counts, transcript paths, staging URL, tail excerpts, Supabase
row checks), (b) anything you changed and why, (c) what remains for Gregory —
which should be exactly: make the Part 2 validation calls he wants to make
personally, then say "go" for cutover.
