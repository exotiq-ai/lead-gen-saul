# Saul LeadGen Engine

Next.js 16 dashboard + Supabase + TypeScript. **Phase 2** adds Zod on all API routes, enrichment (`/api/enrichment/*`), scoring (`/api/scoring/*`), outreach approval queue (`/dashboard/outreach`), GHL webhooks, and the OpenClaw-style **Agents** page.

**Git workflow, pre-push hook, and remote** are documented in [`AGENTS.md`](AGENTS.md).

## Environment

Copy `.env.local` and set at least:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (API routes) |
| `APOLLO_API_KEY` | Apollo enrichment (optional; dry-run if missing) |
| `GHL_WEBHOOK_SECRET` | HMAC key; caller sends `X-Saul-Hmac` = hex SHA256 of raw body |
| `GHL_SKIP_SIGNATURE` | `true` to skip verification (local only) |
| `GHL_DEFAULT_TENANT_ID` | Optional UUID for webhook lead resolution |
| `SAUL_MODEL_NAME` | Shown on Agents page (cosmetic) |
| `GHL_API_KEY` / `GHL_LOCATION_ID` | Outbound GHL send (Exotiq sub-account) |
| `GHL_MEDSPA_API_KEY` / `GHL_MEDSPA_LOCATION_ID` | Outbound GHL send (MedSpa sub-account) |
| `GHL_OUTBOUND_DRY_RUN` | Default = dry-run. Set to `false` (or `0`) to enable live GHL sends. Any other value or missing creds keeps the safe default. |

## Database

- **Never run** [`supabase/all_migrations.sql`](supabase/all_migrations.sql) on a project that already has tables (you will get `relation "tenants" already exists`). That file is only for a **completely empty** database.
- **If you already have 001–005 applied** and only need outreach (Phase 2): run
  [`supabase/apply_006_outreach_idempotent.sql`](supabase/apply_006_outreach_idempotent.sql) in the Supabase SQL editor (safe to re-run), then `npm run seed` if you want demo outreach rows.
- For a new empty DB, run `001` through `006` in order from [`supabase/migrations/`](supabase/migrations/), or use the full concat file only once. Details: [`supabase/MIGRATIONS.md`](supabase/MIGRATIONS.md).

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
