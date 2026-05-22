# Exotiq GHL Operating SOP

Updated: 2026-05-22
Owner: Avi

## Core rule

Supabase and the Exotiq dashboard are the canonical source of truth for lead intelligence and approved outreach copy.

GHL is the execution and tracking engine for humans: contacts, custom fields, tags, pipeline stages, tasks, conversations, and reply tracking.

## Where approved copy lives

Canonical approved copy:
- Supabase table: `outreach_queue`
- Column: `message_draft`
- Status: `approved`
- Dashboard page: `https://leadsbysaul.netlify.app/dashboard/outreach?tenant=exotiq`

GHL mirror:
- Contact custom field: `Last Approved Outreach Draft`
- API field key: `contact.dm_draft`
- Purpose: convenience for humans working from GHL.
- Important: if GHL and Supabase ever conflict, trust Supabase/dashboard and re-run the mirror job.

## Current GHL contact fields

Renamed for clarity:
- `OpenClaw Lead ID` -> `Exotiq Lead ID`
- `DM Draft` -> `Last Approved Outreach Draft`
- `DM Template Used` -> `Last Outreach Template Used`

Added for Exotiq operations:
- `Outreach Channel`, key `contact.outreach_channel`
- `Last Outreach Status`, key `contact.last_outreach_status`
- `Last Outreach Sent At`, key `contact.last_outreach_sent_at`
- `IG DM Status`, key `contact.ig_dm_status`
- `Website Contact URL`, key `contact.website_contact_url`
- `Owner Confidence`, key `contact.owner_confidence`
- `Fleet Evidence URL`, key `contact.fleet_evidence_url`
- `Marketplace Fit Tier`, key `contact.marketplace_fit_tier`
- `Insurance Readiness Notes`, key `contact.insurance_readiness_notes`
- `Approved Copy Source`, key `contact.approved_copy_source`

Existing intelligence fields retained:
- Lead Score
- Fleet Size
- Fleet Size Confidence
- IG Handle
- IG Followers
- Google Rating
- Google Reviews
- Vehicle Types
- Enrichment Sources
- DO NOT SAY

## Human workflow

1. Start in the Exotiq dashboard outreach queue.
2. Review approved copy and contact links.
3. If working in GHL, open the contact and use:
   - `Last Approved Outreach Draft` for the current approved copy.
   - `Outreach Channel` for intended channel.
   - `IG DM Status` to know whether Instagram still needs manual verification.
   - `DO NOT SAY` before writing or calling.
   - `Marketplace Fit Tier` to know whether this is Gregory-only or standard outreach.
4. For Score 5 / Gregory-only leads, phone-first unless Gregory says otherwise.
5. Do not auto-send outreach from scripts. GHL sends only from explicit human action or approved future workflow.

## Mirror job

Script:
- `scripts/ghl_mirror_approved_outreach.py`

Dry-run:
- `python3 scripts/ghl_mirror_approved_outreach.py --limit 86`

Live mirror:
- `python3 scripts/ghl_mirror_approved_outreach.py --limit 86 --live`

What it does:
- Reads approved Exotiq outreach queue items from Supabase.
- Finds or creates a matching GHL contact.
- Avoids duplicate contacts by matching existing `ghl_contact_id`, then email/phone, then exact company name search.
- Cleans bad migrated phone values, especially website domains stored in phone fields.
- Mirrors approved copy and lead intelligence into GHL custom fields.
- Backfills `leads.ghl_contact_id` and `ghl_last_sync` in Supabase.

Latest verified result:
- 86 approved queue items mirrored.
- 86 approved queue leads have `ghl_contact_id` backfilled.
- 0 mirror errors on final run.

## Backup and change logs

Before GHL changes, run:
- `python3 scripts/ghl_backup_audit.py`

Recent backup:
- `/Users/gbot/.hermes/work/hermes-review/exotiq_ghl_backup_20260522_041743.json`

Recent setup change log:
- `/Users/gbot/.hermes/work/hermes-review/exotiq_ghl_setup_changes_20260522_041843.json`

Recent mirror logs are saved under:
- `/Users/gbot/.hermes/work/hermes-review/exotiq_ghl_mirror_*.json`

## Safety rules

- Do not print secrets.
- Do not auto-send outreach.
- Do not treat GHL `Last Approved Outreach Draft` as canonical if it conflicts with Supabase.
- Do not run Apollo unless Gregory explicitly re-enables it.
- Do not archive or delete GHL workflows without a fresh backup and explicit approval.
- Keep Score 5 as Gregory-only.
