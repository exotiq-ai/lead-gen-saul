# Saul Demo Mode — Staging Handoff and Prepared Cutover

Date: 2026-06-11
Branch: `claude/stoic-hypatia-hl3t32`
Staging worker: `https://saul-demo-staging.gregory-ringler.workers.dev`

## Current verified staging state

- Staging Cloudflare Worker deployed as `saul-demo-staging`.
- Health check passed:
  - `GET https://saul-demo-staging.gregory-ringler.workers.dev/health`
  - response: `{"ok":true,"service":"saul-provider-phone-agent"}`
- Staging KV namespace is wired:
  - binding: `SAUL_CALL_STATE`
  - title: `staging-SAUL_CALL_STATE`
  - id: `2e8244ea7b974875ada758d84468783c`
- Staging vars preserve dry-run isolation:
  - `SAUL_DRY_RUN = "true"`
  - `SAUL_SOURCE_TAG = "saul_phone_agent_staging"`
  - `GHL_INBOUND_EMAIL_FOLLOWUP_ENABLED = "false"`
- Staging secrets set in Cloudflare:
  - `ANTHROPIC_API_KEY`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `ELEVENLABS_SHARED_SECRET`
- The staging ElevenLabs shared secret is stored locally on Avi's machine at:
  - `/Users/gbot/.hermes/secrets/saul_demo_staging_elevenlabs_shared_secret.txt`

## Verification evidence

From `voice-agent/`:

```sh
npm run typecheck
npm test
npm run simulate
npx wrangler deploy --dry-run --outdir /tmp/wb
CLOUDFLARE_API_TOKEN=... npx wrangler deploy --dry-run --outdir /tmp/wbs --env staging
```

Results:

- TypeScript clean.
- Node tests pass: 43/43.
- Default dry-run bundles with production KV `979e9f93f6e2438f946ca5c9cf735e9f`.
- Staging dry-run bundles with staging KV `2e8244ea7b974875ada758d84468783c`.
- Simulator transcripts committed under `voice-agent/test/simulated-calls/`:
  - `clean-funnel.md`
  - `demo-refusal.md`
  - `mid-demo-derail.md`

Simulator behavior verified:

- Clean funnel proceeds discovery → demo → debrief.
- Demo refusal stays in discovery and does not push the demo.
- Mid-demo AI derail exits immediately to debrief.
- Demo mode exposes only the demo-exit path.
- Pricing pressure does not produce quoted price ranges.
- Reverse close appears at most once per transcript.

## ElevenLabs staging blocker

The locally saved ElevenLabs API key can read agents, including production agent:

- production agent id: `agent_0001kthsce71ehsvshmwrk2br7h6`
- production name: `Saul Providers`
- production Custom LLM URL currently points at:
  - `https://saul-provider-phone-agent.gregory-ringler.workers.dev`

However, the API key is missing `convai_write`, so API duplication failed with:

```text
missing_permissions: The API key you used is missing the permission convai_write
```

Because of that, Avi could not complete the ElevenLabs clone/configure step via API.

Manual/dashboard action needed, or provide an ElevenLabs key with `convai_write`:

1. Duplicate production agent `Saul Providers` (`agent_0001kthsce71ehsvshmwrk2br7h6`).
2. Name the clone `Saul Demo Staging`.
3. Set Custom LLM URL to:
   - `https://saul-demo-staging.gregory-ringler.workers.dev`
4. Set Custom LLM auth Bearer token to the value in:
   - `/Users/gbot/.hermes/secrets/saul_demo_staging_elevenlabs_shared_secret.txt`
5. Enable Custom LLM extra body.
6. Attach a test number or use dashboard test calls.
7. Create/configure post-call webhook:
   - URL: `https://saul-demo-staging.gregory-ringler.workers.dev/webhooks/elevenlabs-post-call`
   - events: transcript
   - transcript format: JSON
8. Provide the ElevenLabs webhook signing secret to Avi so he can set:
   - `npx wrangler secret put ELEVENLABS_POST_CALL_SECRET --env staging`

## Staging validation checklist still remaining

After the ElevenLabs staging clone is configured:

1. Run `npx wrangler tail --env staging` from `voice-agent/` with Cloudflare token available.
2. Make staging calls covering:
   - clean funnel
   - demo refusal
   - mid-demo derail / AI question
   - freeze at role-play
   - pricing question inside demo
3. Confirm in tail logs:
   - stable call id across turns from `elevenlabs_extra_body.conversation_id`
   - no fresh UUID per turn
   - mode transitions discovery → demo → debrief
   - no Worker errors
4. Confirm Supabase staging writes:
   - `leads.source = 'saul_phone_agent_staging'`
   - `lead_activities`: `demo_started`, `demo_completed` where applicable
   - `agent_runs`: call rows and post-call transcript rows after webhook is configured
5. Confirm no production side effects:
   - no real GHL contact/opportunity/appointment
   - no SMS
   - no Telegram messages
6. Check perceived latency:
   - first words approximately within one second after caller turn end
   - if slow, test only staging with `PRIMARY_MODEL=claude-haiku-4-5` and compare before changing defaults

## Prepared production cutover — do not execute without Gregory's explicit go

Production cutover remains blocked until staging calls pass and Gregory says `go`.

When Gregory explicitly approves production cutover:

1. Ensure this branch has been merged to the intended production branch, or explicitly confirm cutting over from this branch.
2. Set production post-call webhook secret:

   ```sh
   cd voice-agent
   npx wrangler secret put ELEVENLABS_POST_CALL_SECRET
   ```

3. Deploy the production worker only after go:

   ```sh
   cd voice-agent
   npx wrangler deploy
   ```

4. In the production ElevenLabs agent (`Saul Providers`, `agent_0001kthsce71ehsvshmwrk2br7h6`):
   - enable Custom LLM extra body
   - add post-call webhook URL:
     - `https://saul-provider-phone-agent.gregory-ringler.workers.dev/webhooks/elevenlabs-post-call`
   - keep the production Custom LLM URL unchanged unless Gregory explicitly changes it

5. Gregory makes one real production call before announcing anything:
   - clean funnel through demo/debrief
   - confirm Telegram fires
   - confirm GHL appointment/contact behavior is real and correct
   - confirm transcript lands in Supabase

Rollback:

- Cloudflare dashboard rollback on `saul-provider-phone-agent`, or
- `git revert` the voice-agent changes and deploy production again.
- ElevenLabs extra body and webhook config are safe to leave enabled unless they introduce unexpected operational noise.
