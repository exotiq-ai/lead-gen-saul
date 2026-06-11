# Ask Saul Prospector Agent: "Demo Mode" (Multiple Hats) — Build Spec

Status: build-ready spec (v3 — A/B testing shelved until customer volume; model
selection finalized).
Scope: `voice-agent/` (Saul provider phone agent), plus small Supabase additions.
Audience: this doc is the specification a build agent works from. Acceptance
criteria are in §10.

---

## 1. The idea

A prospect (a service provider — the business we sell agents to) calls the Ask Saul
line. Saul runs the call in three acts:

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
stateless per turn. "Switching hats" is therefore just choosing **which system prompt
to assemble for this turn** based on what mode the call is in. No ElevenLabs feature is
needed for the switch itself.

Not possible mid-call: changing the **voice**. ElevenLabs voice settings are fixed once
a conversation starts. That's fine — see §4.3.

**Complexity check:** built as one mega-prompt ("sometimes act like X, sometimes Y"),
this WILL bleed roles. Built as a small **mode state machine with one hat per prompt**,
it is robust. Failure modes and mitigations are enumerated in §5.

## 3. Design: a 3-state machine, one hat per prompt

```
DISCOVERY  --start_demo_roleplay-->  DEMO  --end_demo_roleplay-->  DEBRIEF
   ^                                                                  |
   '----------------- (close: log + book Gregory) <-------------------'
```

### 3.1 Mode resolution

Per request, the worker resolves the call's mode BEFORE building the prompt:

1. **Primary: Cloudflare KV keyed by call id.** The mode-switch tools write
   `{ mode, demo_facts }` to KV (TTL ~1 hour). Each turn reads it.
   ⚠️ Precondition: verify the call id is **stable across turns**. `index.ts:35-38`
   resolves `x-call-id` / `dynamic_variables.call_id` / `metadata.call_id` and falls
   back to `crypto.randomUUID()` — if ElevenLabs is not currently sending a stable id,
   enable the Custom LLM "extra body" so the conversation id arrives, and confirm in
   worker logs before relying on KV.
2. **Fallback: deterministic transcript scan.** The bridge and exit lines are scripted
   VERBATIM in the prompts (e.g. "put yourself in the shoes of one of your customers" /
   "let me take my Saul hat back off"). Since ElevenLabs replays the whole transcript
   each turn, scanning assistant messages for the last sentinel phrase recovers the
   mode with zero infrastructure and zero latency. Ship this even if KV works — it
   makes the system self-healing.

Do NOT try to carry state in tool_results: the worker's internal agentic loop is
collapsed to final text before returning to ElevenLabs, so tool calls never appear in
the next turn's history.

**Fail-open rule:** if KV is unreachable, the id is missing, or no sentinel is found,
mode resolves to DISCOVERY — which IS the current agent's behavior. A failure anywhere
in the demo machinery degrades to today's Saul, never to a broken call.

### 3.2 New tools and tool gating (the big robustness win)

| Tool | Mode available | Purpose |
|---|---|---|
| `start_demo_roleplay` | DISCOVERY only | Params: `business_name`, `business_type`, `city_state`, `services`, `pain_points`, `customer_scenario`, plus the lead-capture fields. Writes mode+facts to KV. **Also logs the lead** (§4.1). |
| `end_demo_roleplay` | DEMO only | Param: `demo_outcome` (completed / caller_exited / derailed). Writes DEBRIEF mode, logs a `demo_completed` activity. |
| `qualify_and_log_lead`, `book_gregory_followup`, `answer_capability_question` | DISCOVERY + DEBRIEF only | Unchanged. |

In DEMO mode the model sees **only** `end_demo_roleplay`. The role-played agent can
therefore never write a fake lead to Supabase, sync garbage to GHL, or book a phantom
appointment on Gregory's calendar — an entire class of breakage removed by construction.

### 3.3 Prompts per mode (`buildSystemPrompt(mode, facts)`)

- **DISCOVERY** = current prompt + a "bridge" section: conditions for offering the demo
  (business type + at least one pain point known, interest ≥ curious), the exact
  two-step consent script, and the instruction to call `start_demo_roleplay` only
  after the caller confirms they're ready.
- **DEMO** = compact, fully different prompt: *"You are now the phone agent for
  {business_name}, a {business_type} in {city_state}. The caller is playing one of
  their own customers ({customer_scenario}). Greet as that business, capture the job
  details, ask intake questions, offer to book. Everything is illustrative — invent
  plausible specifics, commit to nothing real. Keep it to 3–5 exchanges, then find a
  natural wrap ('Perfect, you're all set — someone will confirm shortly') and call
  end_demo_roleplay. If the caller breaks character, asks about Saul/pricing/AI, or
  says anything like 'okay Saul', exit immediately via end_demo_roleplay."*
  Same voice-style rules (8–15 words, contractions, no markdown) carry over, as do the
  no-pricing/no-guarantee rules, reframed as "illustrative only."
- **DEBRIEF** = closing prompt: step out explicitly ("Okay — Saul hat back on."), ask
  what stood out, use the reverse close ONCE (§4.6), handle the surfaced objection,
  update `qualify_and_log_lead` if new info emerged, then book via
  `book_gregory_followup` per existing consent rules.

Keep each mode's prompt byte-stable per call (interpolate only the demo facts, fixed at
switch time) so Anthropic prompt caching keeps working within a mode.

### 3.4 Vertical presets already exist

`src/lib/local-services/config.ts` defines HVAC / garage doors / driveways /
aging-in-place verticals with demo framing ("Call like you are a customer needing HVAC
help..."). Reuse these as default `customer_scenario` seeds per detected vertical so
the demo prompt is grounded even when discovery was thin.

## 4. Design decisions that make it sell

### 4.1 Log the lead BEFORE the demo, not after

The moment the caller says "yes, show me" is peak engagement — and the moment before
the riskiest segment of the call. `start_demo_roleplay` logs/upserts the lead (minimum
`interest_level: warm` — they consented to a demo) as part of switching hats. If the
caller hangs up mid-demo, the qualified lead is already in Supabase + GHL. The demo
becomes upside, not risk.

### 4.2 Aim the demo at their stated pain

If discovery surfaced "we miss after-hours calls," the scenario is a 9 PM emergency. If
"owner answers everything," the scenario is a new-customer call arriving mid-job. The
demo IS the objection handler. In debrief, reflect their own numbers back: *"You said
you miss maybe five calls a week. That call you just made? That's one of them,
booked."*

### 4.3 Use the single-voice constraint

One voice visibly stepping into a role is its own demonstration of flexibility. In
debrief, convert the constraint into a close: *"And that was my voice — yours would
have the greeting you want, the voice you pick."* (True voice change = ElevenLabs
agent-to-agent transfer; deferred, see §9.)

### 4.4 Rescue callers who freeze at improv

The DISCOVERY bridge prompt includes a rescue: *"Just say something like 'my AC died
this morning' and I'll take it from there."* The agent carries 80% of the demo.

### 4.5 Keep the demo short on purpose

3–5 exchanges, ~60–90 seconds. The demo's job is the "aha," not completeness. The DEMO
prompt ends the scene proactively; the caller can end it any time.

### 4.6 Subconscious-close toolkit (style rules, not a checklist)

Embedded as voice-style rules, each used at most once per call:

- **Ownership language** from the bridge onward: "your agent," never "our product."
- **Assumptive future-pacing** in discovery: "when your agent picks up at 9 PM..."
- **Micro-commitments**: demo consent → scenario consent → "want me to have Gregory
  set this up the same way?"
- **Tie-down after the demo**: "and that whole intake would already be sitting in your
  CRM."
- **The reverse close — exactly once, in DEBRIEF:** *"Is there any reason an agent
  like this wouldn't work for your business?"* Surfaces the true objection; a "no" is
  self-persuasion. Once. Twice is a script.
- **Vertical social proof** where true: "garage-door companies usually have it route
  emergency calls first."

The existing "Do not overpitch. Discover first." rule stays the umbrella.

## 5. Failure modes and mitigations

| Risk | Mitigation |
|---|---|
| Role bleed (agent half-in/half-out of the role) | One hat per prompt; the model never sees both role descriptions in the same turn. |
| Demo writes real data (fake leads, phantom bookings) | Tool gating: DEMO mode exposes only `end_demo_roleplay`. |
| Mode state lost mid-call | Verbatim sentinel lines + transcript scan as stateless fallback; KV as primary; fail-open to DISCOVERY. |
| Unstable `call_id` breaks KV | Verify stable id from ElevenLabs first (extra body); transcript scan works regardless. |
| Caller freezes at role-play | Agent offers the scenario and carries the demo (§4.4). |
| Demo runs long / derails | Hard 3–5 exchange budget + explicit exit triggers in DEMO prompt. |
| Caller hangs up mid-demo | Lead already logged at hat-switch (§4.1). |
| Demo overpromises | DEMO prompt carries the same no-pricing/no-guarantee rules, reframed as "illustrative only." |
| Model too weak / too slow | §6: Sonnet 4.6 with thinking disabled; Haiku 4.5 fallback; latency budget enforced before cutover. |

## 6. Model selection

### 6.1 ⚠️ Immediate fix regardless of this project

The worker's default model `claude-3-5-haiku-20241022` (`voice-agent/src/index.ts:40`)
was **retired on 2026-02-19 and now returns 404**. Unless `PRIMARY_MODEL` is set in the
Worker's environment, every call is currently hitting the error-fallback line ("Sorry,
I hit a snag..."). Check the deployed env var first; either way, replace the code
default. Drop-in replacement: `claude-haiku-4-5`.

### 6.2 Recommended model for this line: Claude Sonnet 4.6

The demo's believability is the product, volume is low, and per-call cost is noise next
to the value of a booked lead. Current options:

| Model | ID | $/MTok in/out | Fit for a live phone turn |
|---|---|---|---|
| Haiku 4.5 | `claude-haiku-4-5` | $1 / $5 | Fastest; fine for discovery; weakest at role-play register shifts. The fallback. |
| **Sonnet 4.6** | `claude-sonnet-4-6` | $3 / $15 | **Recommended.** Best speed/intelligence balance; with thinking disabled + `effort: "low"` it is configured for low-latency chat. |
| Opus 4.8 | `claude-opus-4-8` | $5 / $25 | Smarter, but slower turns buy nothing a 10-second phone exchange can use. |
| Fable 5 | `claude-fable-5` | $10 / $50 | **Wrong tool for runtime.** Thinking is always on and turns can run long — built for deep agentic work, not sub-second conversational TTFT. (Great as the *build* agent; not the model answering the phone.) |

Configuration for the worker (`voice-agent/src/claude.ts`):

```ts
model: env.PRIMARY_MODEL ?? 'claude-sonnet-4-6',
thinking: { type: 'disabled' },
output_config: { effort: 'low' },   // NOTE: omit effort if falling back to Haiku 4.5 — it errors there
```

Cost reality check: a full demo-mode call (~20 turns, growing transcript) lands around
$0.20–0.50 on Sonnet — irrelevant against a booked Gregory follow-up.

### 6.3 Latency budget and true streaming

`streamingResponse()` (`index.ts:123`) currently buffers the entire completion and
emits it as one SSE chunk — the caller hears silence for the whole LLM round-trip.
Acceptable for short Haiku turns; not acceptable on Sonnet for a demo whose quality IS
the pitch. Implement true token streaming (Claude stream → SSE chunks) as part of the
model upgrade. Budget: **time-to-first-token under ~800 ms** on demo-mode turns,
verified on staging calls before cutover.

## 7. Rollout and isolation (same repo, isolated deployment)

Do NOT split to a new repo — shared code (`supabase.ts`, `ghl.ts`, tools) would fork
and drift. Isolation happens at the deployment layer:

1. **Feature branch → second Cloudflare Worker** (`saul-demo-staging`, wrangler
   environment). Production worker untouched.
2. **Cloned ElevenLabs agent pointed at the staging worker URL**, test number or
   dashboard test calls. Production agent and phone number never change during
   development.
3. **Staging side effects in dry-run** (reuse the `GHL_OUTBOUND_DRY_RUN` pattern);
   Supabase writes tagged `saul_phone_agent_staging`.
4. **Cutover = one field** (repoint the production agent's Custom LLM URL).
   **Rollback = the same field back.** No deploy in either direction.
5. **Fail-open by construction** (§3.1).

## 8. Testing and measurement

### 8.1 Test before phone: transcript replay + simulated callers

The worker takes a plain OpenAI-format transcript over HTTP, so the state machine is
testable as text:

- **Fixture replay (deterministic):** vitest suite replaying scripted multi-turn
  transcripts; asserts mode transitions, tool gating (no real tools callable in DEMO),
  sentinel detection, fail-open. Adversarial cases: caller refuses the demo, asks "is
  this AI?" mid-demo, plays a hostile customer, goes silent, asks for pricing inside
  the role-play.
- **LLM caller simulator (fuzzing):** a second LLM plays the provider (chatty HVAC
  owner, skeptical garage-door owner, improv-frozen caller) through full simulated
  calls. Review transcripts before any staging call.

Gate: suite passes → 10 clean staging calls (including one intentional derail) →
cutover.

### 8.2 Transcript persistence (post-call webhook)

Today only `last_user_text` is logged per call. Add an ElevenLabs **post-call webhook**
endpoint (worker or Next.js `/api/webhooks/elevenlabs`) that stores full transcript +
duration + funnel outcome per `call_id` in Supabase and attaches a transcript summary
to the GHL contact note — so Gregory walks into the follow-up with the call in front of
him. Ships with Phase 2.

### 8.3 Measurement without an A/B framework (split testing is shelved — §9)

Instrument the funnel as `lead_activities` events: `demo_offered`, `demo_started`,
`demo_completed`, `reverse_close_asked`. Primary metric: **booked-Gregory-follow-up
rate**, compared before/after launch against the historical baseline (already
queryable; same pattern as `/api/dashboard/roi`). This answers "does the demo convert?"
without any variant machinery, and the events are the foundation A/B testing plugs into
later.

### 8.4 Compliance sanity check (one-time)

The prompt discloses AI only when asked. Some states regulate undisclosed bots in sales
calls, and two-party-consent rules matter if calls are recorded. Risk is low on an
inbound line where the demo is explicitly AI — but do a one-time legal sanity check on
the discovery portion before scaling volume. Likely worst case: a one-line greeting
tweak.

## 9. Shelved / deferred (revisit when there are paying customers)

- **Voice/speed split testing.** Mechanism confirmed and documented: ElevenLabs
  conversation-initiation webhook returns per-call TTS overrides (voice, speed,
  stability); worker `/call-init` endpoint assigns variants and logs them; trend card
  on the dashboard. Deferred because at current volume the stats are noise — the §8.3
  funnel events ship now so the data is ready when this turns on.
- **Returning-caller recognition** (lookup by caller number in `/call-init`, greet with
  context). Same webhook as split testing; defer together.
- **Agent-to-agent transfer** for a true voice change in demo mode.
- **Bandit-style variant allocation.**

## 10. Build phases and acceptance criteria

**Phase 0 — Safety rails + model fix (~half day)**
- Check deployed `PRIMARY_MODEL`; replace the retired `claude-3-5-haiku-20241022`
  default with the chosen model (§6).
- Staging worker (wrangler environment) + cloned ElevenLabs agent pointed at it.
- Dry-run wiring for staging side effects; `saul_phone_agent_staging` source tag.
- Transcript-replay test skeleton.
- ✅ *Done when:* a test call to the staging number completes a normal discovery call
  end-to-end with zero writes to production GHL/calendar, and the test suite runs in CI
  (`npm run typecheck` clean; pre-push hook passes).

**Phase 1 — Hat switch core (~1 day)**
- `prompts.ts` → `buildSystemPrompt(mode, demoFacts)` with the three prompts and
  verbatim sentinel lines.
- New `modes.ts`: mode resolution (KV read + transcript-scan fallback + fail-open).
- `tools.ts`: `start_demo_roleplay` (logs lead + writes KV), `end_demo_roleplay`;
  per-mode tool filtering.
- `index.ts`: resolve mode before prompt build; pass the mode's tool set.
- Wrangler KV namespace binding; verify stable call id from ElevenLabs (enable Custom
  LLM extra body if needed).
- ✅ *Done when:* fixture replay suite passes all transition + gating + adversarial
  cases, and a live staging call completes discovery → demo → debrief → (dry-run)
  booking with correct mode at every turn.

**Phase 2 — Instrumentation, transcripts, latency (~1 day)**
- Funnel events to `lead_activities` (§8.3).
- Post-call webhook → transcript persistence + GHL contact note (§8.2).
- True token streaming; measure TTFT on staging calls against the ~800 ms budget.
- DEBRIEF prompt polish (reverse close) + Telegram notify upgrade ("completed demo!").
- LLM caller-simulator runs; transcript review.
- ✅ *Done when:* 10 clean staging calls (one intentional derail) with transcripts
  visible in Supabase and TTFT within budget.

**Phase 3 — Cutover (~1 hour + monitoring)**
- Repoint production ElevenLabs agent's Custom LLM URL to the new worker.
- Disable dry-run for production; keep staging worker alive as the rollback target.
- Watch the first N production calls via transcripts + Telegram.
- ✅ *Done when:* first real prospect completes a demo-mode call and the booked-rate
  dashboard shows the funnel events flowing.

## 11. Open questions

1. Is ElevenLabs currently sending a stable per-call id to the worker? (Determines
   whether KV is primary or the transcript scan carries v1.)
2. Is `PRIMARY_MODEL` set on the deployed production worker? (Determines whether
   production is currently erroring on every call — check this TODAY.)
3. Who does the one-time compliance sanity check (§8.4) and when?
