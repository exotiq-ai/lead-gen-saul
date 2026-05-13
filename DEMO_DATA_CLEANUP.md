# Demo Data Cleanup — May 13, 2026

## What happened

The `scripts/seed.ts` script was originally written for the AskSaul.ai era
to populate the Exotiq Supabase project (`qbvkisrazmipmwlejqtf`) with 500
fake demo leads for UI development and demos. When Exotiq transitioned
from Saul to Claude Code, these synthetic leads were still sitting in the
production database alongside 125 real operator leads.

## What was deleted

All demo / synthetic data was removed from the production Supabase
instance:

| Table | Records deleted | Identification method |
|---|---|---|
| `leads` | 500 | `company_industry = 'exotic_car_rental'` (hardcoded by seed.ts; real leads have `company_industry IS NULL`) |
| `leads` | 45 | `company_name LIKE 'Dummy Result%'` (web-scraper placeholders that never resolved to real companies) |
| `lead_activities` | 786 | FK cascade from deleted seed leads |
| `enrichments` | 109 | FK cascade from deleted seed leads |
| `outreach_queue` | 58 | FK cascade from deleted seed leads (8 from seed.ts + 50 from other demo inserts) |

`scoring_history` rows pointing at deleted leads also cleared via FK
cascade (679 → 269; 0 orphans).

## What remains

- **125 real Exotiq operator leads**, all `source = 'outbound'`,
  `company_industry IS NULL`, `source_detail = 'exotiq_migration:lead_*'`.
  29 have verified email addresses, 38 have contact names.
- **10 MedSpa leads** on the MedSpa tenant — untouched by this cleanup.
- **`outreach_sequences`** — 3 sequences kept (Exotiq default, MedSpa
  default, and the legacy `exotiq_v1`). Template content is independent
  of the fake-lead data.
- All real leads currently have `score = 0` / `lead_grade = 'D'`. This
  is expected — the migration imported them without enrichment fields,
  so the scoring engine returns 0 until Apollo runs.

## What changed in the codebase

### `scripts/seed.ts` — safety gate added

The seed script now refuses to run unless `SEED_CONFIRM=yes` is set as an
environment variable. This prevents a future accidental `npm run seed`
from re-polluting production.

**Before:** `npm run seed` (ran immediately, no confirmation)

**After:** `SEED_CONFIRM=yes npm run seed` (requires explicit opt-in;
plain `npm run seed` prints a warning and exits with code 1)

### No other code changes

`src/lib/demo/datasets.ts` (the client-side demo-mode dataset) was not
modified. That file only serves the UI demo toggle and does not write to
the database.

## For future reference

- **To identify seed data if it ever reappears:** seed leads have
  `company_industry = 'exotic_car_rental'`. Real migrated leads have
  `company_industry IS NULL` and `source_detail` starts with
  `exotiq_migration:lead_`.
- **To seed a dev / demo environment intentionally:**
  `SEED_CONFIRM=yes npm run seed`. Make sure `.env.local` points at the
  correct (non-prod) Supabase project first.
- **`scripts/reset-demo.ts`** (`npm run reset-demo`) also exists and may
  benefit from the same safety treatment if it ever touches production
  data — not addressed in this pass.
