# Ask Saul Prospector Agent: "Demo Mode" (Multiple Hats) — Feasibility + Build Plan

Status: proposal / plan (no code changes yet)
Scope: `voice-agent/` (Saul provider phone agent), plus small Supabase + dashboard additions in later phases.

---

## 1. The idea, restated

A prospect (a service provider — the business we sell agents to) calls the Ask Saul line.
Saul runs the call in three acts:

1. **Discovery (current behavior).** Casual, friendly familiarization that is quietly
   qualifying the lead — business type, call handling today, pain points.
2. **Demo (the new hat).** Saul offers: *"Sounds like an agent would fit your kind of
   business. Want to hear how that would sound for YOUR business?"* On consent, Saul
   role-plays as that caller's own phone agent while the caller plays one of their
   customers. The demo is the pitch — they hear their own agent answering their own
   customer.
3. **Debrief + close (back to the first hat).** Saul steps out of the role, asks what
   stood out, surfaces the real objection, logs/updates qualification, and books the
   Gregory follow-up.

## 2. Feasibility verdict

**Feasible, and the current architecture is unusually well-suited to it.**

The key fact: ElevenLabs (Custom LLM integration) sends the **full spoken transcript on
every turn** to the worker, and the worker **rebuilds the system prompt on every
request** (`buildSystemPrompt('Saul')` in `voice-agent/src/index.ts:39`). The worker is
stateless per turn. "Switching hats" is therefore not a platform fight — it is just
choosing **which system prompt to assemble for this turn** based on what mode the call
is in. No ElevenLabs feature is needed for the switch itself.

What is NOT possible mid-call: changing the **voice**. ElevenLabs voice/TTS settings are
fixed once a conversation starts (overrides are applied at conversation initiation
only). That is fine — see §4.3.

**Is it overly complex / prone to break?** Only if built the naive way: one mega-prompt
that says "sometimes act like X, sometimes like Y." That WILL bleed roles, especially on
Haiku with 320 max tokens. Built as a small **mode state machine with one hat per
prompt**, it is robust. The failure modes are known and each has a cheap mitigation
(§5).

## 3. Design: a 3-state machine, one hat per prompt

```
DISCOVERY  --start_demo_roleplay-->  DEMO  --end_demo_roleplay-->  DEBRIEF
   ^                                                                  |
   '----------------- (close: log + book Gregory) <-------------------'
```

### 3.1 Mode resolution (the only genuinely new machinery)

Per request, the worker resolves the call's mode BEFORE building the prompt:

1. **Primary: Cloudflare KV keyed by call id.** The mode-switch tools write
   `{ mode, demo_facts }` to KV (short TTL, e.g. 1 hour). Each turn reads it.
   ⚠️ Precondition: verify the call id is **stable across turns**. `index.ts:35-38`
   resolves `x-call-id` / `dynamic_variables.call_id` / `metadata.call_id` and falls
   back to `crypto.randomUUID()` — if ElevenLabs is not currently sending a stable id,
   enable the Custom LLM "extra body" so the conversation id arrives, and confirm in
   worker logs before relying on KV.
2. **Fallback: deterministic transcript scan.** The bridge and exit lines are scripted
   VERBATIM in the prompts (e.g. "put yourself in the shoes of one of your customers" /
   "let me take my Saul hat back off"). Since ElevenLabs replays the whole transcript
   each turn, scanning assistant messages for the last sentinel phrase recovers the mode
   with zero infrastructure and zero latency. Ship this even if KV works — it makes the
   system self-healing.

Do NOT try to carry state in tool_results: the worker's internal agentic loop is
collapsed to final text before returning to ElevenLabs, so tool calls never appear in
the next turn's history.

### 3.2 New tools (and tool gating — the big robustness win)

| Tool | Mode available | Purpose |
|---|---|---|
| `start_demo_roleplay` | DISCOVERY only | Params: `business_name`, `business_type`, `city_state`, `services`, `pain_points`, `customer_scenario`. Writes mode+facts to KV. **Also logs the lead** (see §4.1). |
| `end_demo_roleplay` | DEMO only | Param: `demo_outcome` (completed / caller_exited / derailed). Writes DEBRIEF mode, logs a `demo_completed` activity. |
| `qualify_and_log_lead`, `book_gregory_followup`, `answer_capability_question` | DISCOVERY + DEBRIEF only | Unchanged. |

In DEMO mode the model sees **only** `end_demo_roleplay`. The role-played agent can
therefore never write a fake lead to Supabase, sync garbage to GHL, or book a phantom
appointment on Gregory's calendar — an entire class of breakage removed by construction.

### 3.3 Prompts per mode (`buildSystemPrompt(mode, facts)`)

- **DISCOVERY** = current prompt + a "bridge" section: the conditions for offering the
  demo (business type + at least one pain point known, interest ≥ curious), the exact
  two-step consent script, and the instruction to call `start_demo_roleplay` only after
  the caller confirms they're ready.
- **DEMO** = compact, fully different prompt: *"You are now the phone agent for
  {business_name}, a {business_type} in {city_state}. The caller is playing one of their
  own customers ({customer_scenario}). Greet as that business, capture the job details,
  ask intake questions, offer to book. Everything is illustrative — invent plausible
  specifics, commit to nothing real. Keep it to 3–5 exchanges, then find a natural wrap
  ('Perfect, you're all set — someone will confirm shortly') and call
  end_demo_roleplay. If the caller breaks character, asks about Saul/pricing/AI, or says
  anything like 'okay Saul', exit immediately via end_demo_roleplay."*
  Same voice-style rules (8–15 words, contractions, no markdown) carry over.
- **DEBRIEF** = closing prompt: step out explicitly ("Okay — Saul hat back on."), ask
  what stood out, use the reverse close ONCE (§4.2), handle the surfaced objection,
  update `qualify_and_log_lead` if new info emerged, then book via
  `book_gregory_followup` per existing consent rules.

### 3.4 Vertical presets already exist

`src/lib/local-services/config.ts` already defines HVAC / garage doors / driveways /
aging-in-place verticals with demo framing ("Call like you are a customer needing HVAC
help..."). Reuse these as default `customer_scenario` seeds per detected vertical so the
demo prompt is grounded even when discovery was thin.

## 4. Improvements on the original idea

### 4.1 Log the lead BEFORE the demo, not after

The moment the caller says "yes, show me" is peak engagement — and also the moment
before the riskiest segment of the call. `start_demo_roleplay` should require the same
fields as `qualify_and_log_lead` and log/upsert the lead as part of switching hats. If
the caller hangs up mid-demo or the demo derails, the qualified lead (with
`interest_level: warm` minimum — they consented to a demo) is already in Supabase + GHL.
The demo becomes upside, not risk.

### 4.2 Aim the demo at their stated pain

Don't run a generic demo. If discovery surfaced "we miss after-hours calls," the
scenario is a 9 PM emergency call. If it was "owner answers everything," the scenario is
a new-customer call arriving while they're on a job. The demo then IS the objection
handler. In debrief, reflect their own numbers back: *"You said you miss maybe five
calls a week. That call you just made? That's one of them, booked."* Loss framing built
from their own words never feels salesy.

### 4.3 Don't fight the single-voice constraint — use it

Voice cannot change mid-call, and that's fine: one voice visibly stepping into a role is
its own demonstration of flexibility. In debrief, convert the constraint into a close:
*"And that was my voice — yours would have the greeting you want, the voice you pick."*
(A true voice change is possible only via ElevenLabs agent-to-agent transfer — a
possible v2, but the handoff adds latency and context-transfer risk; skip for v1.)

### 4.4 Handle callers who freeze at improv

Some owners will go blank at "pretend you're your customer." The DISCOVERY bridge prompt
should include a rescue: offer the scenario for them — *"Just say something like 'my AC
died this morning' and I'll take it from there."* The agent carries 80% of the demo; the
caller only has to respond.

### 4.5 Keep the demo short on purpose

3–5 exchanges, ~60–90 seconds. The job of the demo is the "aha," not completeness.
Overlong demos invite derailment, burn goodwill, and delay the close. The DEMO prompt
ends the scene proactively; the caller can also end it any time.

### 4.6 Subconscious-close toolkit (style rules, not a checklist)

Embedded throughout, each used at most once per call — Haiku will overdo anything
presented as a checklist, so these go in as voice-style rules:

- **Ownership language** from the bridge onward: "your agent," never "our product"
  (endowment effect).
- **Assumptive future-pacing** in discovery: "when your agent picks up at 9 PM..."
- **Micro-commitments**: demo consent → scenario consent → "want me to have Gregory
  set this up the same way?" Each small yes makes the booking yes smaller.
- **Tie-down after the demo**: "and that whole intake would already be sitting in your
  CRM."
- **The reverse close (the user's line — keep it, exactly once, in DEBRIEF):**
  *"Is there any reason an agent like this wouldn't work for your business?"*
  It surfaces the true objection, and a "no, can't think of one" is self-persuasion
  (consistency principle). Once. Twice is a script.
- **Vertical social proof** where true: "garage-door companies usually have it route
  emergency calls first." (Keep within the existing no-overpromise rules.)

The existing prompt's "Do not overpitch. Discover first." rule stays the umbrella — the
techniques live inside that constraint, not instead of it.

## 5. Failure modes and mitigations

| Risk | Mitigation |
|---|---|
| Role bleed (agent half-in/half-out of the role) | One hat per prompt; the model never sees both role descriptions in the same turn. |
| Demo writes real data (fake leads, phantom bookings) | Tool gating: DEMO mode exposes only `end_demo_roleplay`. |
| Mode state lost mid-call | Verbatim sentinel lines + transcript scan as stateless fallback; KV as primary. |
| Unstable `call_id` breaks KV | Verify stable id from ElevenLabs first (extra body); transcript scan works regardless. |
| Caller freezes at role-play | Agent offers the scenario and carries the demo (§4.4). |
| Demo runs long / derails | Hard 3–5 exchange budget + explicit exit triggers in DEMO prompt. |
| Haiku too weak for the dual-register call | `ESCALATION_MODEL` env already exists unused (`voice-agent/src/claude.ts`); run this line on a Sonnet-class model — it's a low-volume sales line, cost is negligible, and the demo quality IS the product. Measure latency before committing. |
| Caller hangs up mid-demo | Lead already logged at hat-switch (§4.1). |
| Demo overpromises | DEMO prompt carries the same no-pricing/no-guarantee rules, reframed as "illustrative only." |

## 6. Rollout and isolation strategy (same repo, isolated deployment)

Do NOT split to a new repo — the shared code (`supabase.ts`, `ghl.ts`, tools) would
fork and drift, and merging back later is the most expensive path. Isolation happens at
the deployment layer instead, which gives identical safety:

1. **Feature branch in this repo → second Cloudflare Worker** (`saul-demo-staging`,
   wrangler environment). Production worker untouched.
2. **Cloned ElevenLabs agent pointed at the staging worker URL** — duplicate the
   production agent in ElevenLabs, attach a test number (or use dashboard test calls).
   The production agent and phone number never change during development.
3. **Staging side effects in dry-run.** Reuse the existing dry-run pattern
   (`GHL_OUTBOUND_DRY_RUN`) so staging calls never write to Gregory's real calendar or
   send real SMS; Supabase writes go to a clearly tagged source
   (`saul_phone_agent_staging`).
4. **Cutover = one field**: repoint the production agent's Custom LLM URL to the new
   worker. **Rollback = the same field back.** No deploy needed in either direction.
5. **Fail-open by construction**: mode resolution defaults to DISCOVERY, which IS the
   current agent's behavior. If KV, mode detection, or demo machinery fails mid-call,
   the call degrades to today's agent — not a broken one.

## 7. Test before phone: transcript replay + simulated callers

The biggest de-risking step costs no phone calls at all. The worker takes a plain
OpenAI-format transcript over HTTP, so the whole state machine is testable as text:

- **Fixture replay (deterministic):** a vitest suite that replays scripted multi-turn
  transcripts against the worker and asserts mode transitions, tool gating (no real
  tools callable in DEMO), sentinel detection, and fail-open behavior. Covers the
  adversarial cases: caller refuses the demo, asks "is this AI?" mid-demo, plays a
  hostile customer, goes silent, asks for pricing inside the role-play.
- **LLM caller simulator (fuzzing):** a second LLM plays the provider (persona seeded
  per vertical: chatty HVAC owner, skeptical garage-door owner, improv-frozen caller)
  and runs full simulated calls against the worker. Cheap, fast, and finds the weird
  paths before a human ever dials. Transcripts get reviewed before staging calls begin.

Live staging calls happen only after the suite passes; production cutover only after
N clean staging calls (suggest 10) including at least one intentional derail.

## 8. Split testing voices and speed

**Mechanism (confirmed supported):** ElevenLabs inbound calls can fetch
"conversation initiation client data" from a webhook before the call connects; the
webhook response can override TTS settings — voice, speed, stability — per call.

- Add a `/call-init` endpoint to the worker (same shared-secret auth pattern).
- It assigns a variant — deterministic hash of caller number (so repeat callers get a
  consistent experience) or round-robin — returns the overrides, and logs
  `{call_id, variant: {voice_id, speed, stability}}` to Supabase (a small
  `call_experiments` table, or `lead_activities` metadata).
- Variants must also be enabled in the ElevenLabs agent's Security tab (overrides are
  off by default).

**Metrics** (all already flow into Supabase; they just need the variant key joined):
booked-Gregory-follow-up rate (primary), demo started → demo completed rate, call
duration, `interest_level` distribution.

**The first experiment is demo vs. no-demo — not voice A vs. voice B.** The same
variant machinery can flag a call as demo-enabled or current-behavior. Baseline the
existing booked-follow-up rate from historical data first, then split traffic. Prove
the feature moves the number before tuning voices within it.

**Honest stats caveat — "check trend shifts" is the right instinct.** At a new line's
call volume, classic A/B significance needs hundreds of calls per arm. Do NOT build a
stats framework now. Ship: (a) one variable varied at a time (feature first, then
voice, then speed), (b) a small trend card on the dashboard (same pattern as
`/api/dashboard/roi`), (c) a review cadence. Graduate to epsilon-greedy bandit only if
volume justifies it.

New funnel events (`lead_activities`): `demo_offered`, `demo_started`,
`demo_completed`, `reverse_close_asked` — these make "does the demo convert?" itself
measurable, which is the experiment that matters more than voice choice.

## 9. Gaps closed in round 2

### 9.1 Persist full transcripts (post-call webhook)

Today only `last_user_text` is logged per call (`logCallSession`). That is not enough
for (a) Gregory walking into the follow-up call with context, (b) judging split-test
results, or (c) tuning prompts from real calls. ElevenLabs supports a **post-call
webhook** delivering the full transcript and call metadata — add an endpoint (worker or
Next.js `/api/webhooks/elevenlabs`) that stores transcript + duration + variant +
funnel outcome per `call_id` in Supabase and attaches a transcript summary to the GHL
contact note before Gregory's call. This is cheap and should ship with Phase 2, not
later.

### 9.2 Latency: the current "streaming" is fake

`streamingResponse()` (`index.ts:123`) buffers the entire completion and emits it as
one SSE chunk — the caller hears silence for the whole LLM round-trip. Acceptable for
short Haiku turns; it will NOT be acceptable if the model is upgraded for demo quality.
True token streaming from Claude → SSE is the fix and benefits the existing agent too.
Schedule it alongside the model benchmark; treat "time-to-first-token under ~800 ms" as
the budget for demo-mode turns.

### 9.3 AI disclosure / recording compliance check

The prompt discloses AI only when asked. Several states regulate undisclosed bots in
sales calls (e.g. California's bot-disclosure law) and two-party-consent states matter
if calls are recorded for the split tests. This is an inbound line and the demo itself
is explicit about being an AI, so risk is low — but a one-time legal sanity check on
the discovery portion belongs on the list before scaling call volume. A one-line
greeting tweak is the likely worst case.

### 9.4 Returning-caller recognition (v2, high wow, low cost)

The conversation-initiation webhook receives the caller's number before the call
connects. Look up the lead in Supabase and inject context: "Hey, welcome back — last
time we talked about your garage-door intake. Gregory's call is set for Thursday,
want to add anything?" Costs one DB read in `/call-init`; lands as a v2 item with the
split-testing endpoint since it is the same webhook.

## 10. Build phases

**Phase 0 — Safety rails (~half day)**
- Staging worker (wrangler environment) + cloned ElevenLabs agent pointed at it.
- Dry-run wiring for staging side effects; `saul_phone_agent_staging` source tag.
- Transcript-replay test skeleton (fixtures + assertions on mode/tool gating).

**Phase 1 — Hat switch core (~1 day)**
- `voice-agent/src/prompts.ts`: `buildSystemPrompt(mode, demoFacts)` with the three
  prompts; verbatim sentinel lines.
- New `voice-agent/src/modes.ts`: mode resolution (KV read + transcript-scan fallback).
- `voice-agent/src/tools.ts`: `start_demo_roleplay` (logs lead + writes KV),
  `end_demo_roleplay`; per-mode tool filtering.
- `voice-agent/src/index.ts`: resolve mode before prompt build; pass mode's tool set.
- `wrangler` config: KV namespace binding.
- Verify stable call id from ElevenLabs (enable Custom LLM extra body if needed).
- Test: scripted multi-turn transcripts replayed against the worker locally.

**Phase 2 — Instrumentation + transcripts (~1 day)**
- Funnel events to `lead_activities` (demo_offered/started/completed).
- Post-call webhook → full transcript persistence + GHL contact note (§9.1).
- DEBRIEF prompt with reverse close + improved Telegram notify ("completed demo!").
- Benchmark model upgrade via `PRIMARY_MODEL`/`ESCALATION_MODEL`; if upgrading,
  implement true token streaming (§9.2).
- LLM caller-simulator runs; review transcripts; 10 clean staging calls → cutover.

**Phase 3 — Split testing (~1 day)**
- `/call-init` endpoint + variant assignment + Supabase logging.
- First experiment: demo-enabled vs. current behavior, against the historical baseline.
- ElevenLabs agent: enable initiation webhook + overrides.
- Dashboard trend card (booked rate by variant, demo funnel).

**Phase 4 — v2 candidates (only if v1 earns it)**
- Voice/speed variants (after the feature itself proves out).
- Returning-caller recognition in `/call-init` (§9.4).
- Agent-to-agent transfer for a true voice change in demo mode.
- Per-vertical demo presets expanded from `local-services/config.ts`.
- Bandit-style variant allocation.

## 11. Open questions

1. Is ElevenLabs currently sending a stable per-call id to the worker? (Determines
   whether KV is primary or the transcript scan carries v1.)
2. Model for this line: keep Haiku 3.5 or move to Sonnet-class? (Recommend benchmarking
   Sonnet latency on a test call; the demo's believability is the product.)
3. Which voices/speeds for the first split test? (Pick 2 voices max to start.)
