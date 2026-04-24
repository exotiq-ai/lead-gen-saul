# Supabase migrations

| File | Use when |
| --- | --- |
| `all_migrations.sql` | **One-time** on a brand-new database with **no** existing `tenants` table. |
| `migrations/00X_*.sql` | Run in numeric order, each file **once** per project. |
| `apply_006_outreach_idempotent.sql` | DB already has schema through `005` and you only need outreach tables + RLS. Safe to re-run. |

## “relation already exists”

You applied earlier migrations (or used `all_migrations` once). Do **not** re-run the full `all_migrations.sql`. Add only the migrations you are missing, e.g. for Phase 2 run `apply_006_outreach_idempotent.sql` (or a single run of `migrations/006_outreach_schema.sql` if the outreach tables are not there yet).

## `syntax error at or near "REATE"` (missing `C`)

Postgres is seeing `REATE TABLE` instead of `CREATE TABLE` — the leading **`C`** was dropped (bad paste, partial selection, or a one-off editor glitch).

1. Copy the **entire** `006` file from this repo again (or pull latest).
2. In the Supabase SQL editor, clear the tab, paste **all** of it, then Run — do not run a partial selection.
3. If it still happens, on the first line that starts with `REATE`, put **`C`** at the beginning so it reads **`CREATE`**.

Migrations 006+ start with a harmless `SELECT 1;` so the first real `CREATE` is not the very first bytes of the script (reduces some paste issues).
