# Goal: Build Saul "Demo Mode" (multiple hats) per the spec

## Mission

Implement the prospector demo-mode voice agent described in
`docs/ask-saul-prospector-demo-mode-plan.md`. Read that spec first — it is the
source of truth for design, constraints, and acceptance criteria. This goal
defines scope, boundaries, and done; the spec defines how.

Context for judgment calls: the Ask Saul phone line is how we convert service
providers into customers. The demo — Saul role-playing as the caller's own phone
agent — IS the pitch. Believability and call-flow robustness outrank elegance,
token cost, and feature count. When in doubt, choose the option that can never
break a live call: the system must fail open to today's discovery-only behavior.

## Scope

Deliver **Phases 0, 1, and 2** of the spec (§10), in order, gated by each
phase's "done when" criteria:

1. **Phase 0 — Safety rails + model fix.** Replace the retired
   `claude-3-5-haiku-20241022` default (it 404s) per spec §6; staging worker
   config (wrangler environment); dry-run wiring; `saul_phone_agent_staging`
   source tag; test skeleton.
2. **Phase 1 — Hat switch core.** Three-mode prompt assembly, mode resolution
   (KV + transcript-scan fallback + fail-open), `start_demo_roleplay` /
   `end_demo_roleplay`, per-mode tool gating.
3. **Phase 2 — Instrumentation.** Funnel events to `lead_activities`, ElevenLabs
   post-call webhook → transcript persistence + GHL note, true token streaming
   with the ~800 ms TTFT budget, caller-simulator test runs.

**Phase 3 (production cutover) is explicitly out of scope.** Instead, produce
`docs/ask-saul-demo-mode-cutover-runbook.md`: the exact manual steps for Gregory
(ElevenLabs dashboard changes, Cloudflare env vars/secrets, KV namespace
creation, cutover field, rollback field, what to watch on the first calls).

## Hard boundaries

- **Never touch production:** no changes to the deployed production worker, the
  production ElevenLabs agent, production env vars, or Gregory's real calendar.
  All side-effect paths must default to dry-run in staging config.
- **Git:** work on branch `feature/saul-demo-mode` branched from
  `claude/stoic-hypatia-hl3t32`. Commit incrementally with clear messages. Push
  only to that branch. Do not push to `main`. Do not create a PR unless asked.
- **Models:** runtime model per spec §6 — `claude-sonnet-4-6` default (thinking
  disabled, effort low), `claude-haiku-4-5` as the env-selectable fallback (no
  `effort` param on Haiku). Do not substitute other models.
- **Prompts:** the discovery prompt's existing sales rules (no pricing promises,
  honest-about-AI, do-not-overpitch) carry into every mode. The soft-close
  techniques in spec §4.6 are style rules used at most once per call each — do
  not turn them into a per-call checklist.
- This is a Next.js repo with breaking changes vs. your training data — follow
  `AGENTS.md` and read `node_modules/next/dist/docs/` before touching anything
  under `src/`.

## Access gaps — handle, don't stall

You likely cannot reach the Cloudflare dashboard, deployed env vars, or the
ElevenLabs console from this environment. When a step needs them:

1. Build and test everything that is code (the worker is plain HTTP — the entire
   state machine is testable via transcript replay without any deployment).
2. Put the manual step in the cutover runbook with exact values.
3. Flag it once in your progress notes and keep moving — do not block on it.

The one urgent flag: whether `PRIMARY_MODEL` is set on the deployed production
worker (spec §11.2). You cannot check it; say so explicitly in your first
progress report so a human verifies today, and fix the code default regardless.

## Verification — claims need evidence

- `npm run typecheck` clean before every push (the pre-push hook enforces it).
- The fixture-replay suite (spec §8.1) must cover every mode transition, tool
  gating in DEMO, sentinel detection, fail-open, and all five adversarial cases
  — and pass. Write the tests alongside the code, not after.
- If `ANTHROPIC_API_KEY` is available in this environment, run the LLM
  caller-simulator against the worker locally (wrangler dev or a direct handler
  harness) for at least: one clean full-funnel call, one demo refusal, one
  mid-demo derail. Include the transcripts in the repo under
  `voice-agent/test/simulated-calls/` for human review. If no key is available,
  say so and ship the simulator as a runnable script instead.
- Before reporting any phase complete, audit each claim against a tool result
  from this session. If something is unverified (e.g., live TTFT needs a real
  staging call), state it as unverified — do not round it up to done.

## Done

All Phase 0–2 acceptance criteria in spec §10 that are verifiable in this
environment pass with evidence; the cutover runbook exists and is complete
enough that a human can take the system live without reading the code; the
branch is pushed; and your final report states (a) what is proven, (b) what
awaits the staging phone call, and (c) the single next action for Gregory.
