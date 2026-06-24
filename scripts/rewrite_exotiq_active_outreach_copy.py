#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client

TENANT_ID = "00000000-0000-0000-0000-000000000001"
OUTDIR = Path.home() / ".hermes" / "work" / "exotiq-enrichment"

TEMPLATES = [
    (80, "recent_content_control", "Hey {first_name}, Gregory Ringler here. I run Exotiq.\n\n{personalization_hook}\n\nAt your scale, the hard part usually is not getting attention. It is keeping quote, availability, renter check, deposit, and handoff tight without making the customer experience feel ordinary.\n\nThat is where Exotiq fits. One command center for pricing, bookings, compliance, and guest comms, with Rari handling the admin that steals nights and weekends.\n\nWorth comparing notes for 15 minutes?"),
    (60, "recent_content_paid_booking_gap", "Hey {first_name}, Gregory Ringler here. I run Exotiq.\n\n{personalization_hook}\n\nRenters in your market move fast, but a premium operator can’t treat every inquiry like a generic quote. The money is usually made or lost between “what do you have this weekend?” and a paid, verified booking.\n\nExotiq gives exotic operators one command center for pricing, availability, deposits, docs, follow-up, and Rari-assisted guest comms.\n\nWorth a quick look this week?"),
    (0, "recent_content_clean_handoff", "Hey {first_name}, Gregory Ringler here. I run Exotiq.\n\n{personalization_hook}\n\nFor operators growing past the early stage, a missed handoff can cost more than a missed lead. The gap is usually between someone asking what is available and a paid, verified booking with the details handled cleanly.\n\nThat is what Exotiq is built around: one cleaner path from inquiry to renter check, deposit, agreement, and handoff.\n\nWorth comparing notes for 15 minutes?"),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def first_text(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def hook(lead: dict[str, Any]) -> str:
    sb = lead.get("score_breakdown") or {}
    ig = first_text(sb.get("latest_instagram_post_summary"), sb.get("recent_ig_post"))
    if ig:
        return f"Saw the recent post about {ig}. It reads like you are already selling the experience, not just renting cars."
    partnership = first_text(sb.get("latest_brand_partnership_summary"))
    if partnership:
        return f"I saw the recent partnership/event mention about {partnership}. That kind of visibility makes the booking handoff matter even more."
    news = first_text(sb.get("latest_news_pr_summary"), sb.get("recent_news_pr"))
    if news:
        return f"I saw the recent mention about {news}. That kind of visibility makes the booking handoff matter even more."
    business = first_text(sb.get("latest_business_observation_summary"))
    if business:
        return f"I was looking at {lead.get('company_name') or 'your operation'} and noticed {business}. My read is that the opportunity is tightening the path from interest to a paid, verified booking."
    company = lead.get("company_name") or "your operation"
    location = lead.get("company_location") or "your market"
    return f"I was looking at {company} in {location}. My read is that the opportunity is tightening the path from interest to a paid, verified booking."


def render(row: dict[str, Any]) -> tuple[str, str]:
    lead = row.get("leads") or {}
    score = lead.get("score") or 0
    for min_score, variant, body in TEMPLATES:
        if score >= min_score:
            return variant, body.format(first_name=lead.get("first_name") or "there", personalization_hook=hook(lead))
    raise AssertionError("template routing failed")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tenant-id", default=TENANT_ID)
    ap.add_argument("--limit", type=int, default=500)
    ap.add_argument("--live", action="store_true")
    args = ap.parse_args()
    load_dotenv(".env.local")
    db = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    OUTDIR.mkdir(parents=True, exist_ok=True)

    resp = db.table("outreach_queue").select(
        "id,status,channel,message_draft,lead_id,generated_by,leads(first_name,company_name,company_location,score,score_breakdown)"
    ).eq("tenant_id", args.tenant_id).in_("status", ["pending", "approved"]).limit(args.limit).execute()
    rows = resp.data or []
    backup = OUTDIR / f"outreach_copy_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    backup.write_text(json.dumps(rows, indent=2, default=str))

    changed = []
    for row in rows:
        if row.get("channel") not in ("instagram_dm", "email", "linkedin_dm", "sms"):
            continue
        variant, copy = render(row)
        if copy == row.get("message_draft"):
            continue
        changed.append({"id": row["id"], "lead_id": row.get("lead_id"), "company_name": (row.get("leads") or {}).get("company_name"), "variant": variant})
        if args.live:
            db.table("outreach_queue").update({
                "message_draft": copy,
                "generated_by": f"saul_agent:{variant}:recent_context_v2",
                "updated_at": now_iso(),
            }).eq("id", row["id"]).eq("tenant_id", args.tenant_id).execute()
    audit = OUTDIR / f"outreach_copy_rewrite_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    audit.write_text(json.dumps(changed, indent=2, default=str))
    print(json.dumps({"live": args.live, "examined": len(rows), "changed": len(changed), "backup": str(backup), "audit": str(audit)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
