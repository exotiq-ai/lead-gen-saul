# Saul LeadGen — Human TODO

**Updated:** 2026-05-13
**Deployment URL:** https://leadsbysaul.netlify.app/

---

## Priority 1: Get the Agent Running (blocks everything else)

- [ ] **Choose hosting for Python agent** — Railway (recommended), Fly.io, or DigitalOcean
  - Railway: railway.app → New Project → Deploy from GitHub → point to `python-agent/`
  - Estimated cost: ~$5/mo

- [ ] **Set environment variables on hosting platform:**
  - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase URL
  - `SUPABASE_SERVICE_ROLE_KEY` = service role key
  - `APOLLO_API_KEY` = Apollo key
  - `GOOGLE_PLACES_API_KEY` = Google Places key
  - `GHL_API_KEY` + `GHL_LOCATION_ID` = Exotiq GHL
  - `GHL_MEDSPA_API_KEY` + `GHL_MEDSPA_LOCATION_ID` = MedSpa GHL
  - `OPENAI_API_KEY` = for AI insights (gpt-4o-mini, ~$0.20/day)
  - `APP_BASE_URL` = `https://leadsbysaul.netlify.app`
  - `INSIGHTS_ENABLED` = `true`
  - `INSIGHTS_MODEL` = `gpt-4o-mini`

- [ ] **Apply Supabase migration 011** (agent_insights table):
  - Paste `supabase/migrations/011_agent_insights.sql` into the Supabase SQL editor
  - This enables the AI insights feature in the Daily Brief

- [ ] **Enable cron schedule**: `*/15 * * * *` running `python main.py --once`

- [ ] **Verify first run**: Check `SELECT * FROM agent_runs ORDER BY completed_at DESC LIMIT 5;`

---

## Priority 2: Score Backfill + Data Quality

- [ ] **Run score backfill** (fixes step-function score distribution from migration data):
  ```bash
  npm run backfill-scores
  ```
  Requires `SUPABASE_SERVICE_ROLE_KEY` in env. ~70 seconds for ~700 leads.

- [ ] **Confirm migrations 009 + 010 are applied** (tenant RLS + outreach templates):
  ```sql
  SELECT COUNT(*) FROM outreach_sequences;  -- should be > 0
  SELECT COUNT(*) FROM agent_insights;      -- should be 0 until agent runs
  ```

---

## Priority 3: GHL Live Mode (when ready)

- [ ] **Flip `GHL_OUTBOUND_DRY_RUN=false`** on the hosting platform
  - Only after confirming: templates are correct, GHL credentials work, Gregory has approved test sends
  - Currently safe: "Mark sent" button logs to console but doesn't actually send

- [ ] **Decide who approves going live**: Gregory alone, or Gregory + Ariella?

---

## Priority 4: OpenClaw Transition

- [ ] **Cancel/disable OpenClaw** once Railway (or chosen host) is confirmed working
- [ ] **Remove OpenClaw webhook URLs** if any are configured in GHL
- [ ] **Confirm agent_runs table shows regular entries** (every 15 min, both tenants)

---

## Priority 5: Content & Templates

- [ ] **Review V3 DM template bodies** in `outreach_sequences` table
  - Current templates are placeholder/generic
  - Need Gregory's actual voice + the Jay Denver case study text
  - Can update via dashboard (Settings → Outreach Templates) or directly in Supabase

- [ ] **Answer Saul's open questions** (from `SAUL_REVIEW_2026-05-03.md`):
  - Should outreach score threshold differ between Exotiq (55) and MedSpa?
  - Is there a desired Apollo cost cap per day? (currently uncapped)
  - For MedSpa, CSV import only or autonomous discovery too?

---

## Future Considerations (not blocking)

- [ ] **Claude Code SDK orchestration** — upgrade from simple cron to intelligent meta-orchestration (see `CLAUDE_CODE_DEPLOYMENT_PLAN.md` Phase 3)
- [ ] **Stage 3d: SSO** — pick identity provider (Supabase magic-link, Google, GitHub, Clerk)
- [ ] **Mobile phase** — touch targets, bottom nav, PWA manifest
- [ ] **Action buttons in Daily Brief** — clicking "Re-engage" or "Approve Draft" from insight cards executes directly
- [ ] **Insight feedback loop** — track which insights Gregory acts on vs dismisses to tune quality

---

## Quick Reference

| What | Where |
|------|-------|
| Live site | https://leadsbysaul.netlify.app/ |
| Demo mode | https://leadsbysaul.netlify.app/dashboard?demo=true |
| GitHub | https://github.com/exotiq-ai/lead-gen-saul |
| Supabase | https://qbvkisrazmipmwlejqtf.supabase.co |
| Deployment plan | `CLAUDE_CODE_DEPLOYMENT_PLAN.md` |
| Saul handoff | `SAUL_INSIGHTS_HANDOFF.md` |
| OpenClaw handoff | `OPENCLAW_HANDOFF.md` |
| Stages report | `STAGES_COMPLETE_REPORT.md` |
