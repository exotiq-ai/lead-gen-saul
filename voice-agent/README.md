# Saul Provider Phone Agent

ElevenLabs Custom-LLM webhook for the inbound **Ask Saul / phone-agent sales line**.

This is separate from the rank-and-rent consumer job-intake voice agents. It is for service providers/business owners who call in asking about AI phone agents for their own business.

## What the agent is trained to do

- Greet as Saul and use the caller's name naturally.
- Qualify whether the caller is interested in an agent helping their business.
- Ask about business type, location, current call handling, missed calls, after-hours, CRM/GHL, and desired agent tasks.
- Explain capabilities without overpromising pricing, revenue, or exact calendar availability.
- Log the lead in the Saul Leads dashboard under the Ask Saul/local-services tenant.
- Optionally sync/upsert the contact to the Ask Saul GHL location when `GHL_LOCAL_SERVICES_*` env vars are configured.
- Book a Gregory follow-up request by collecting consent, preferred time window, outstanding questions, and custom needs.
- Optionally notify Gregory through Telegram when a follow-up request is booked.

## Endpoints

- `GET /health` — worker health check.
- `POST /chat/completions` — OpenAI-compatible Custom LLM endpoint for ElevenLabs.

## Required environment

```bash
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Defaults route all leads to Ask Saul/local-services:

```bash
DEFAULT_TENANT_ID=22222222-2222-2222-2222-222222222222
DEFAULT_TENANT_SLUG=ask-saul
APP_BASE_URL=https://leadsbysaul.netlify.app
```

Optional GHL sync uses the Ask Saul/local-services location only:

```bash
GHL_LOCAL_SERVICES_API_KEY=
GHL_LOCAL_SERVICES_LOCATION_ID=RxCVQeGoQ3RTJbbLG5gY
GHL_API_VERSION=2021-07-28
```

Do not set this worker up with the Exotiq/default GHL location unless Gregory explicitly changes the campaign target.

## ElevenLabs setup

Configure the ElevenLabs agent Custom LLM URL to:

```text
https://<worker-host>/chat/completions
```

If `ELEVENLABS_SHARED_SECRET` is set, send:

```text
Authorization: Bearer <secret>
```

## Local verification

```bash
cd voice-agent
npm install
npm run typecheck
npm test
npx wrangler deploy --dry-run --outdir /tmp/saul-provider-phone-agent-dryrun
```

## Deploy

```bash
cd voice-agent
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put ELEVENLABS_SHARED_SECRET
# Optional:
npx wrangler secret put GHL_LOCAL_SERVICES_API_KEY
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler deploy
```

Secrets should not be committed. Use `.dev.vars` locally, copied from `.dev.vars.example`.
