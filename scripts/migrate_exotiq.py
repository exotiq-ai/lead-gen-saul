"""
Migration: Exotiq Intelligence Dashboard (SQLite) -> Saul LeadGen (Supabase)

Maps 169 real Exotiq leads into the new Supabase schema.

Column mapping:
  SQLite                  -> Supabase
  id                      -> external_id (original ID preserved, new UUID generated)
  company                 -> company_name
  contact_first_name      -> first_name
  contact_last_name       -> last_name
  contact_email           -> email
  contact_phone           -> phone
  contact_linkedin        -> linkedin_url
  company_website         -> company_domain (domain extracted)
  company_address         -> company_location (appended)
  market                  -> company_location
  scoring_score (1-5)     -> score (x20 -> 0-100)
  outreach_status         -> status (mapped)
  notes                   -> notes
  metadata JSONB          -> enrichment data, IG handle, fleet, etc.

Score mapping: 1=20, 2=40, 3=60, 4=80, 5=100
Status mapping:
  New/DM Drafted/On Hold  -> new
  Contacted/Outreach      -> outreach
  Responded/Engaged       -> engaged
  Demo Scheduled          -> qualified
  Not a Fit               -> disqualified

Assigned_to:
  score 5 (100) -> gregory
  score < 5     -> team

Usage:
  DRY_RUN=1 python3 migrate_exotiq.py   # shows what would happen
  python3 migrate_exotiq.py             # live migration
"""

import os
import sys
import sqlite3
import re
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

# Load env
_here = Path(__file__).parent
load_dotenv(_here.parent / "python-agent" / ".env")
load_dotenv(_here.parent / ".env.local")

from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
SQLITE_PATH = Path(__file__).parent.parent.parent / "exotiq-dashboard" / "db" / "exotiq.db"
TENANT_ID = "00000000-0000-0000-0000-000000000001"
DRY_RUN = os.environ.get("DRY_RUN", "0") == "1"


def extract_domain(url: str) -> str:
    if not url:
        return ""
    url = re.sub(r"https?://", "", url)
    url = url.split("/")[0].replace("www.", "")
    return url.strip()


STATUS_MAP = {
    "new": "new",
    "dm drafted": "new",
    "on hold": "new",
    "contacted": "outreach",
    "outreach": "outreach",
    "responded": "engaged",
    "engaged": "engaged",
    "warm": "engaged",
    "demo scheduled": "qualified",
    "qualified": "qualified",
    "not a fit": "disqualified",
    "disqualified": "disqualified",
    "lost": "lost",
    "converted": "converted",
    "won": "converted",
}


def map_status(raw: str) -> str:
    if not raw:
        return "new"
    return STATUS_MAP.get(raw.lower().strip(), "new")


def map_score(raw) -> int:
    """Convert 1-5 score to 0-100."""
    if raw is None:
        return 0
    try:
        s = int(raw)
        return min(100, max(0, s * 20))
    except (ValueError, TypeError):
        return 0


def run():
    print(f"{'DRY RUN' if DRY_RUN else 'LIVE MIGRATION'} -- Exotiq SQLite -> Supabase")
    print(f"Source: {SQLITE_PATH}")
    print(f"Target tenant: {TENANT_ID}")
    print()

    if not SQLITE_PATH.exists():
        print(f"ERROR: SQLite DB not found at {SQLITE_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row

    leads = conn.execute("SELECT * FROM leads ORDER BY created_at").fetchall()
    print(f"Found {len(leads)} leads in SQLite.")

    if not DRY_RUN:
        db = create_client(SUPABASE_URL, SUPABASE_KEY)
        # Check for existing source_detail to avoid duplicates
        existing_resp = db.table("leads").select("source_detail").eq("tenant_id", TENANT_ID).like("source_detail", "exotiq_migration:%").execute()
        existing_ext_ids = set()
        for row in (existing_resp.data or []):
            sd = row.get("source_detail") or ""
            if sd.startswith("exotiq_migration:"):
                existing_ext_ids.add(sd.replace("exotiq_migration:", ""))
        print(f"Existing leads in Supabase with external_id: {len(existing_ext_ids)}")
    else:
        existing_ext_ids = set()

    migrated = 0
    skipped_dup = 0
    skipped_disq = 0
    errors = 0
    batch = []

    for lead in leads:
        d = dict(lead)
        external_id = d["id"]
        status = map_status(d.get("outreach_status") or "new")
        score = map_score(d.get("scoring_score"))

        # Skip duplicates
        if external_id in existing_ext_ids:
            skipped_dup += 1
            continue

        # Pack all extra Exotiq-specific data into score_breakdown JSONB
        metadata = {
            "external_id": external_id,
            "company_ig_handle": d.get("company_ig_handle"),
            "company_ig_followers": d.get("company_ig_followers"),
            "fleet_size": d.get("fleet_size"),
            "fleet_vehicle_types": d.get("fleet_vehicle_types"),
            "company_google_rating": d.get("company_google_rating"),
            "company_google_reviews": d.get("company_google_reviews"),
            "outreach_dm_draft": d.get("outreach_dm_draft"),
            "outreach_template_used": d.get("outreach_template_used"),
            "outreach_response_received": d.get("outreach_response_received"),
            "outreach_response_category": d.get("outreach_response_category"),
            "contact_email_source": d.get("contact_email_source"),
            "contact_phone_source": d.get("contact_phone_source"),
            "scoring_rationale": d.get("scoring_rationale"),
        }

        # Build red_flags
        red_flags = []
        if status == "disqualified":
            red_flags.append({
                "code": "wrong_icp",
                "reason": "Marked Not a Fit in Exotiq dashboard",
                "flagged_at": d.get("updated_at") or datetime.now(timezone.utc).isoformat(),
            })

        row = {
            "id": str(uuid.uuid4()),
            "tenant_id": TENANT_ID,
            "first_name": d.get("contact_first_name"),
            "last_name": d.get("contact_last_name"),
            "email": d.get("contact_email"),
            "phone": d.get("contact_phone"),
            "linkedin_url": d.get("contact_linkedin"),
            "company_name": d.get("company"),
            "company_domain": extract_domain(d.get("company_website") or ""),
            "company_location": d.get("market") or d.get("company_address") or "",
            "source": "outbound",
            "source_detail": f"exotiq_migration:{external_id}",
            "score": score,
            "icp_fit_score": score,
            "status": status,
            "assigned_to": "gregory" if score >= 100 else "team",
            "red_flags": json.dumps(red_flags),
            "score_breakdown": json.dumps(metadata),
            "ghl_contact_id": d.get("ghl_contact_id"),
            "created_at": d.get("created_at") or datetime.now(timezone.utc).isoformat(),
            "updated_at": d.get("updated_at") or datetime.now(timezone.utc).isoformat(),
        }

        if DRY_RUN:
            print(f"  WOULD INSERT: {row['company_name']} | {row['status']} | score={row['score']} | assigned={row['assigned_to']}")
            migrated += 1
            continue

        batch.append(row)

        # Insert in batches of 25
        if len(batch) >= 25:
            try:
                db.table("leads").insert(batch).execute()
                migrated += len(batch)
                print(f"  Inserted batch of {len(batch)} leads (total: {migrated})")
                batch = []
            except Exception as e:
                print(f"  ERROR inserting batch: {e}")
                errors += len(batch)
                batch = []

    # Final batch
    if batch and not DRY_RUN:
        try:
            db.table("leads").insert(batch).execute()
            migrated += len(batch)
            print(f"  Inserted final batch of {len(batch)} leads (total: {migrated})")
        except Exception as e:
            print(f"  ERROR inserting final batch: {e}")
            errors += len(batch)

    conn.close()

    print()
    print("=" * 50)
    print(f"Migration complete:")
    print(f"  Migrated:          {migrated}")
    print(f"  Skipped (dup):     {skipped_dup}")
    print(f"  Skipped (disq):    {skipped_disq}")
    print(f"  Errors:            {errors}")
    print("=" * 50)


if __name__ == "__main__":
    run()
