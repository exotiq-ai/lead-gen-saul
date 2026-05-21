"""
Restore Exotiq migrated lead scoring metadata from the original SQLite DB.

Why this exists:
- The live Supabase Exotiq rows currently have zeroed score_breakdown fields.
- The TypeScript backfill scorer depends on score_breakdown.fleet_size and other
  metadata to compute non-zero composite scores.
- The original SQLite DB still has scoring_score, fleet_size, IG, Google, draft,
  and rationale fields keyed by source_detail = exotiq_migration:{sqlite_id}.

This script restores the raw migrated metadata and 1-5 mapped score, then the
normal `npm run backfill-scores -- --tenant-id=...` script can recompute the
0-100 composite.
"""

import json
import os
import re
import sqlite3
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parents[1]
SQLITE_PATH = ROOT.parent / "exotiq-dashboard" / "db" / "exotiq.db"
TENANT_ID = "00000000-0000-0000-0000-000000000001"
DRY_RUN = os.environ.get("DRY_RUN", "0") == "1"

load_dotenv(ROOT / ".env.local")
load_dotenv(ROOT / ".env")


def mapped_score(raw) -> int:
    try:
        return max(0, min(100, int(raw or 0) * 20))
    except (TypeError, ValueError):
        return 0


def assigned_to(score: int):
    if score >= 100:
        return "gregory"
    if score <= 20:
        return None
    return "team"


def vehicle_quality(vehicle_types: str | None) -> int:
    text = (vehicle_types or "").lower()
    high = ["ferrari", "lamborghini", "mclaren", "rolls", "bentley", "aston", "huracan", "urus", "488", "720", "911", "gt3"]
    mid = ["corvette", "porsche", "range rover", "g wagon", "g63", "maybach", "maserati"]
    if any(x in text for x in high):
        return 90
    if any(x in text for x in mid):
        return 75
    if text.strip():
        return 60
    return 50


def market_tier(market: str | None) -> int:
    m = (market or "").lower()
    if any(x in m for x in ["miami", "los angeles", "las vegas", "scottsdale", "phoenix", "new york", "nyc"]):
        return 90
    if any(x in m for x in ["dallas", "atlanta", "dc", "denver", "houston", "chicago", "san diego"]):
        return 75
    return 60 if m else 50


def online_presence(followers) -> int:
    try:
        f = int(float(followers or 0))
    except (TypeError, ValueError):
        f = 0
    if f >= 50000:
        return 100
    if f >= 10000:
        return 85
    if f >= 2000:
        return 70
    if f >= 500:
        return 50
    return 35 if f > 0 else 25


def operational_signals(fleet_size, google_reviews) -> int:
    try:
        fleet = int(float(fleet_size or 0))
    except (TypeError, ValueError):
        fleet = 0
    try:
        reviews = int(float(google_reviews or 0))
    except (TypeError, ValueError):
        reviews = 0
    score = 35
    if fleet >= 25:
        score += 40
    elif fleet >= 15:
        score += 30
    elif fleet >= 8:
        score += 20
    elif fleet >= 5:
        score += 10
    if reviews >= 200:
        score += 20
    elif reviews >= 50:
        score += 15
    elif reviews >= 10:
        score += 8
    return min(100, score)


def main():
    if not SQLITE_PATH.exists():
        raise SystemExit(f"SQLite DB not found: {SQLITE_PATH}")
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Missing Supabase env")

    db = create_client(url, key)
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    sqlite_rows = {r["id"]: dict(r) for r in conn.execute("SELECT * FROM leads")}

    resp = db.table("leads").select("id, source_detail, company_name").eq("tenant_id", TENANT_ID).execute()
    rows = resp.data or []
    updated = 0
    missing = 0

    for row in rows:
        sd = row.get("source_detail") or ""
        m = re.match(r"exotiq_migration:(.+)", sd)
        if not m or m.group(1) not in sqlite_rows:
            missing += 1
            continue
        src = sqlite_rows[m.group(1)]
        score = mapped_score(src.get("scoring_score"))
        exotiq_tier = max(1, min(5, int(score / 20) if score else 1))
        breakdown = {
            "external_id": src.get("id"),
            "composite": score,
            "icp_fit": score,
            "exotiq_tier": exotiq_tier,
            "company_ig_handle": src.get("company_ig_handle"),
            "company_ig_followers": src.get("company_ig_followers"),
            "fleet_size": src.get("fleet_size") or 0,
            "fleet_raw": src.get("fleet_size") or 0,
            "fleet_vehicle_types": src.get("fleet_vehicle_types"),
            "company_google_rating": src.get("company_google_rating"),
            "company_google_reviews": src.get("company_google_reviews"),
            "outreach_dm_draft": src.get("outreach_dm_draft"),
            "outreach_template_used": src.get("outreach_template_used"),
            "outreach_response_received": src.get("outreach_response_received"),
            "outreach_response_category": src.get("outreach_response_category"),
            "contact_email_source": src.get("contact_email_source"),
            "contact_phone_source": src.get("contact_phone_source"),
            "scoring_rationale": src.get("scoring_rationale"),
            "original_score_1_to_5": src.get("scoring_score"),
            "vehicle_quality": vehicle_quality(src.get("fleet_vehicle_types")),
            "market_tier": market_tier(src.get("market")),
            "online_presence": online_presence(src.get("company_ig_followers")),
            "operational_signals": operational_signals(src.get("fleet_size"), src.get("company_google_reviews")),
        }
        patch = {
            "score": score,
            "icp_fit_score": score,
            "score_breakdown": breakdown,
            "assigned_to": assigned_to(score),
        }
        if DRY_RUN:
            print(f"DRY {row.get('company_name')} -> score={score} fleet={breakdown['fleet_size']}")
        else:
            db.table("leads").update(patch).eq("id", row["id"]).eq("tenant_id", TENANT_ID).execute()
        updated += 1

    print(json.dumps({"dry_run": DRY_RUN, "updated": updated, "missing_source": missing}, indent=2))


if __name__ == "__main__":
    main()
