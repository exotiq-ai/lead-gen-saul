# Saul Demo Mode — Cutover Runbook

Audience: Gregory (or whoever holds Cloudflare + ElevenLabs access).
Code: `voice-agent/` on branch `claude/stoic-hypatia-hl3t32`.
Spec: `docs/ask-saul-prospector-demo-mode-plan.md`.

Every step below is manual because it needs dashboard or credential access the
build environment doesn't have. Steps are ordered; don't skip the gates.

---

## Part 1 — One-time setup (≈20 minutes)

### 1.1 Create the KV namespaces (Cloudflare)

From `voice-agent/`:

```sh
npx wrangler kv namespace create SAUL_CALL_STATE
npx wrangler kv namespace create SAUL_CALL_STATE --env staging
```

Each command prints an `id`. Open `voice-agent/wrangler.toml`, uncomment the
two `[[kv_namespaces]]` blocks, and paste the matching ids (prod id in the
top-level block, staging id in `[env.staging]`).

> The worker runs fine without KV — it falls back to transcript scanning — but
> KV is the primary mode store and carries the demo facts, so do this first.

### 1.2 Set staging secrets

```sh
npx wrangler secret put ANTHROPIC_API_KEY --env staging
npx wrangler secret put SUPABASE_URL --env staging
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env staging
npx wrangler secret put ELEVENLABS_SHARED_SECRET --env staging   # pick a fresh value
```

Do NOT set `GHL_LOCAL_SERVICES_API_KEY`, Sendblue, or Telegram secrets on
staging — staging runs with `SAUL_DRY_RUN=true` and skips those anyway, and
leads it writes are tagged `source=saul_phone_agent_staging`.

### 1.3 Deploy the staging worker

```sh
npx wrangler deploy --env staging
```

Note the printed URL (e.g. `https://saul-demo-staging.<account>.workers.dev`).
Sanity check: `curl https://saul-demo-staging.<account>.workers.dev/health`
should return `{"ok":true,...}`.

### 1.4 Clone the ElevenLabs agent

In the ElevenLabs dashboard:

1. Duplicate the production Saul agent. Name it `Saul Demo Staging`.
2. In the clone's **Custom LLM** settings, set the URL to the staging worker
   URL from 1.3 and the API key to the `ELEVENLABS_SHARED_SECRET` you set in
   1.2 (sent as a Bearer token).
3. **Enable "Custom LLM extra body"** (or the equivalent setting that forwards
   the conversation id) so the worker receives a stable call id. This is what
   makes the KV mode store reliable; without it the transcript-scan fallback
   carries the call.
4. Set the model field if shown — the worker decides the real model
   (`claude-sonnet-4-6` via `PRIMARY_MODEL`), so this value is cosmetic.
5. Attach a test phone number to the clone, or use dashboard test calls.

### 1.5 Wire the post-call transcript webhook (staging first)

In the ElevenLabs agent's **post-call webhook** settings:

- URL: `https://saul-demo-staging.<account>.workers.dev/webhooks/elevenlabs-post-call`
- Copy the signing secret ElevenLabs generates, then:

```sh
npx wrangler secret put ELEVENLABS_POST_CALL_SECRET --env staging
```

After the first test call, transcripts land in Supabase `agent_runs` with
`agent_type=saul_provider_phone_agent_transcript`, and on the lead's
`lead_activities` as `voice_call_transcript` when the caller's number matches
a lead.

---

## Part 2 — Staging validation gate (do not cut over until this passes)

Make at least **10 staging calls**, covering all of:

- [ ] A clean full funnel: discovery → accept demo → play customer → demo
      wraps → debrief → reverse close → give phone → book follow-up.
- [ ] Decline the demo. Saul must not push; discovery continues.
- [ ] Mid-demo derail: ask "wait, is this the AI?" mid-scene. Saul must exit
      the role-play immediately and debrief gracefully.
- [ ] Freeze at the role-play ("uh, I don't know what to say"). Saul must hand
      you an opener line.
- [ ] Ask for pricing inside the demo. The demo agent must exit, not quote.

Verify after the calls:

- [ ] No real GHL contacts, opportunities, appointments, SMS, or Telegram
      messages were created (staging is dry-run; if any appear, stop and check
      that `SAUL_DRY_RUN=true` is set on the deployed staging worker).
- [ ] Supabase leads from staging have `source=saul_phone_agent_staging`.
- [ ] `demo_started` / `demo_completed` rows appear in `lead_activities`.
- [ ] Transcripts arrive via the post-call webhook.
- [ ] Latency feels phone-grade: first words within ~1 second of your turn
      ending. ElevenLabs must be calling the worker with `stream: true`
      (default for Custom LLM). If turns feel slow, test a call with
      `PRIMARY_MODEL=claude-haiku-4-5` set on staging and compare.

## Part 3 — Production cutover (≈10 minutes, instant rollback)

1. Set the new production secret for the post-call webhook:

   ```sh
   npx wrangler secret put ELEVENLABS_POST_CALL_SECRET
   ```

2. Deploy the production worker from `main` once this branch is merged (or
   from this branch if cutting over pre-merge):

   ```sh
   npx wrangler deploy
   ```

   This deploy also moves production from Haiku 4.5 to Sonnet 4.6
   (`PRIMARY_MODEL` in wrangler.toml) and replaces the retired
   `claude-3-5-haiku-20241022` code fallback.

3. In the ElevenLabs dashboard, on the **production** agent:
   - Enable "Custom LLM extra body" (same as staging step 1.4.3).
   - Add the post-call webhook URL:
     `https://saul-provider-phone-agent.<account>.workers.dev/webhooks/elevenlabs-post-call`.

   The production agent's Custom LLM URL does not change — the same worker
   now serves demo mode.

4. Make one real call to the production number yourself before announcing
   anything. Run the clean funnel once. Check Telegram fires and the GHL
   appointment is real.

**Rollback:** redeploy the previous worker version from the Cloudflare
dashboard (Workers → saul-provider-phone-agent → Deployments → Rollback), or
`git revert` the voice-agent changes and `npx wrangler deploy`. The ElevenLabs
config changes (extra body, webhook) are safe to leave in place either way.

## Part 4 — What to watch the first week

- Telegram: `🎭 Caller completed a live Saul demo` messages — each one is a
  hot lead with peak engagement.
- Supabase `lead_activities`: funnel counts — `demo_started` vs
  `demo_completed` vs `gregory_appointment_booked`. Booked rate vs. the
  pre-launch baseline is THE metric (spec §8.3).
- `agent_runs` transcripts: skim the first few demo calls end to end; tune the
  prompts in `voice-agent/src/prompts.ts` if the demo runs long or the
  reverse close lands clumsily.

## Appendix — Local verification (no dashboards needed)

```sh
cd voice-agent
npm ci
npm run typecheck   # clean
npm test            # 35 tests, all passing
ANTHROPIC_API_KEY=sk-... npm run simulate            # all 3 simulated calls
ANTHROPIC_API_KEY=sk-... npm run simulate clean-funnel
```

The simulator drives full LLM-vs-LLM calls against the worker in-process with
all side effects dry-run, and writes transcripts to
`voice-agent/test/simulated-calls/*.md` with the resolved mode annotated on
every Saul turn. Review those transcripts before staging calls.
