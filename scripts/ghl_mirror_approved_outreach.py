#!/usr/bin/env python3
"""Mirror approved Exotiq outreach intelligence from Supabase into GHL contacts.

Supabase remains canonical for approved copy. GHL gets a human-usable mirror so
operators can work contacts inside GHL without guessing where the copy/status
lives. Safe default is dry-run. Use --live to write to GHL/Supabase.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"
GHL_BASE = "https://services.leadconnectorhq.com"

PHONE_RE = re.compile(r"\+?\d[\d\s().-]{7,}\d")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def load_env() -> None:
    load_dotenv(ROOT / ".env.local")
    load_dotenv(ROOT / "python-agent" / ".env")


def clean_phone(value: str | None) -> str | None:
    if not value:
        return None
    v = value.strip()
    digits = re.sub(r"\D", "", v)
    # Suppress migrated website/domain values accidentally stored in phone.
    if "." in v and len(digits) < 10:
        return None
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return None


def clean_email(value: str | None) -> str | None:
    if not value:
        return None
    v = value.strip().lower()
    return v if EMAIL_RE.match(v) else None


def first_ig_handle(score_breakdown: dict[str, Any]) -> str | None:
    raw = (
        score_breakdown.get("company_ig_handle")
        or score_breakdown.get("instagram_handle")
        or score_breakdown.get("ig_handle")
        or score_breakdown.get("instagram_url")
    )
    if not raw:
        return None
    text = str(raw)
    m = re.search(r"@?([A-Za-z0-9._]{2,30})", text.replace("instagram.com/", "@"))
    if not m:
        return None
    handle = m.group(1).strip("._")
    return f"@{handle}" if handle else None


def fit_tier(score: int | None, fleet_size: Any) -> str:
    try:
        fleet = int(fleet_size) if fleet_size is not None else 0
    except Exception:
        fleet = 0
    s = int(score or 0)
    if s >= 100 or fleet >= 25:
        return "Score 5 - Gregory-only, phone-first"
    if s >= 80 or fleet >= 15:
        return "Strong fit - priority operator"
    if s >= 60 or fleet >= 8:
        return "Good fit - standard pilot outreach"
    return "Lower fit - nurture or verify fleet first"


def do_not_say(score_breakdown: dict[str, Any]) -> str:
    base = [
        "Do not lead with pricing or discounts.",
        "Do not say book a demo.",
        "Do not overpromise marketplace or insurance as live today.",
        "Do not use generic AI hype.",
    ]
    if score_breakdown.get("outreach_response_received"):
        base.append("Prior response signal exists, review activity before new cold outreach.")
    return " ".join(base)


def field_value_map(item: dict[str, Any]) -> dict[str, Any]:
    lead = item.get("leads") or {}
    sb = lead.get("score_breakdown") or {}
    score = lead.get("score")
    fleet_size = sb.get("fleet_size") or sb.get("fleet_raw")
    ig = first_ig_handle(sb)
    source = "Supabase outreach_queue.message_draft, mirrored to GHL for execution"
    return {
        "contact.openclaw_lead_id": lead.get("id") or item.get("lead_id"),
        "contact.lead_score": score,
        "contact.fleet_size": fleet_size,
        "contact.fleet_size_confidence": "HIGH" if fleet_size else "UNKNOWN",
        "contact.ig_handle": ig,
        "contact.ig_followers": sb.get("company_ig_followers"),
        "contact.google_rating": sb.get("company_google_rating"),
        "contact.google_reviews": sb.get("company_google_reviews"),
        "contact.vehicle_types": sb.get("fleet_vehicle_types"),
        "contact.enrichment_sources": "Supabase restored Exotiq migration + dashboard enrichment",
        "contact.do_not_say": do_not_say(sb),
        "contact.dm_draft": item.get("message_draft"),
        "contact.dm_template_used": sb.get("outreach_template_used") or item.get("campaign") or "founding_operator_pilot",
        "contact.outreach_channel": item.get("channel"),
        "contact.last_outreach_status": "approved_not_sent" if item.get("status") == "approved" else item.get("status"),
        "contact.last_outreach_sent_at": item.get("sent_at"),
        "contact.ig_dm_status": "needs_manual_ig_check" if item.get("channel") == "instagram_dm" else None,
        "contact.website_contact_url": None,
        "contact.owner_confidence": "UNKNOWN",
        "contact.fleet_evidence_url": None,
        "contact.marketplace_fit_tier": fit_tier(score, fleet_size),
        "contact.insurance_readiness_notes": "Discuss insurance-readiness only as coming infrastructure, not a live guarantee.",
        "contact.approved_copy_source": source,
    }


def get_fields(headers: dict[str, str], location_id: str) -> dict[str, dict[str, Any]]:
    r = requests.get(f"{GHL_BASE}/locations/{location_id}/customFields", headers=headers, timeout=20)
    r.raise_for_status()
    fields = r.json().get("customFields", [])
    return {f.get("fieldKey"): f for f in fields if f.get("fieldKey")}


def ghl_lookup(
    headers: dict[str, str],
    location_id: str,
    email: str | None,
    phone: str | None,
    company_name: str | None = None,
) -> str | None:
    if email or phone:
        params = [f"locationId={location_id}"]
        if email:
            params.append(f"email={requests.utils.quote(email)}")
        if phone:
            params.append(f"phone={requests.utils.quote(phone)}")
        r = requests.get(f"{GHL_BASE}/contacts/lookup?{'&'.join(params)}", headers=headers, timeout=20)
        if r.ok:
            contacts = r.json().get("contacts") or []
            if contacts:
                return contacts[0].get("id")
    # Many migrated Exotiq leads only have IG/domain data. Before creating a
    # new contact, search by exact company name to avoid duplicating existing
    # GHL contacts imported earlier.
    if company_name:
        q = requests.utils.quote(company_name)
        r = requests.get(f"{GHL_BASE}/contacts/?locationId={location_id}&query={q}", headers=headers, timeout=20)
        if r.ok:
            contacts = r.json().get("contacts") or []
            normalized = company_name.strip().lower()
            for c in contacts:
                if (c.get("companyName") or "").strip().lower() == normalized:
                    return c.get("id")
            if len(contacts) == 1:
                return contacts[0].get("id")
    return None


def create_contact(headers: dict[str, str], location_id: str, lead: dict[str, Any], email: str | None, phone: str | None) -> str | None:
    name = lead.get("company_name") or "Exotiq Operator Lead"
    payload = {
        "locationId": location_id,
        "firstName": lead.get("first_name") or name,
        "lastName": lead.get("last_name") or ("Operator Lead" if not lead.get("first_name") else ""),
        "companyName": name,
        "source": "exotiq-dashboard-approved-outreach",
        "tags": ["exotiq-pipeline", score_tag(lead.get("score"))],
    }
    if email:
        payload["email"] = email
    if phone:
        payload["phone"] = phone
    if lead.get("score", 0) >= 100:
        payload["tags"].append("gregory-only")
    r = requests.post(f"{GHL_BASE}/contacts/", headers=headers, json=payload, timeout=30)
    if not r.ok:
        raise RuntimeError(f"contact create failed {r.status_code}: {r.text[:300]}")
    data = r.json()
    return (data.get("contact") or {}).get("id") or data.get("id")


def score_tag(score: Any) -> str:
    try:
        s = int(score or 0)
    except Exception:
        s = 0
    if s >= 100:
        return "score-5"
    if s >= 80:
        return "score-4"
    if s >= 60:
        return "score-3"
    return "starter"


def update_contact(headers: dict[str, str], contact_id: str, fields_by_key: dict[str, dict[str, Any]], values: dict[str, Any]) -> None:
    custom_fields = []
    for key, value in values.items():
        if value is None or value == "":
            continue
        field = fields_by_key.get(key)
        if not field:
            continue
        custom_fields.append({"id": field["id"], "key": key, "field_value": value})
    payload = {"customFields": custom_fields}
    r = requests.put(f"{GHL_BASE}/contacts/{contact_id}", headers=headers, json=payload, timeout=30)
    if not r.ok:
        raise RuntimeError(f"contact update failed {r.status_code}: {r.text[:400]}")


def fetch_queue(supabase: Any, tenant_id: str, limit: int, company: str | None) -> list[dict[str, Any]]:
    q = (
        supabase.table("outreach_queue")
        .select("id,tenant_id,status,channel,message_draft,sent_at,lead_id,leads(id,company_name,first_name,last_name,email,phone,company_domain,ghl_contact_id,score,score_breakdown)")
        .eq("tenant_id", tenant_id)
        .eq("status", "approved")
        .limit(limit)
    )
    rows = q.execute().data or []
    if company:
        company_l = company.lower()
        rows = [r for r in rows if company_l in ((r.get("leads") or {}).get("company_name") or "").lower()]
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tenant", default=DEFAULT_TENANT_ID)
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--company")
    parser.add_argument("--live", action="store_true")
    args = parser.parse_args()

    load_env()
    ghl_key = os.environ.get("GHL_API_KEY", "")
    location_id = os.environ.get("GHL_LOCATION_ID", "")
    if not ghl_key or not location_id:
        raise SystemExit("Missing GHL credentials")
    supabase = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    headers = {
        "Authorization": f"Bearer {ghl_key}",
        "Version": "2021-07-28",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    fields_by_key = get_fields(headers, location_id)
    items = fetch_queue(supabase, args.tenant, args.limit, args.company)
    result: dict[str, Any] = {"live": args.live, "input_count": len(items), "updated": [], "skipped": [], "errors": []}
    for item in items:
        lead = item.get("leads") or {}
        try:
            email = clean_email(lead.get("email"))
            phone = clean_phone(lead.get("phone"))
            contact_id = lead.get("ghl_contact_id") or ghl_lookup(headers, location_id, email, phone, lead.get("company_name"))
            if args.live and contact_id and not lead.get("ghl_contact_id"):
                supabase.table("leads").update({"ghl_contact_id": contact_id, "ghl_last_sync": datetime.now(timezone.utc).isoformat()}).eq("id", lead.get("id")).execute()
            action = "update" if contact_id else "create"
            values = field_value_map(item)
            preview = {
                "queue_id": item.get("id"),
                "lead_id": lead.get("id"),
                "company": lead.get("company_name"),
                "action": action,
                "contact_id": contact_id,
                "email": email,
                "phone": phone,
                "fields": sorted([k for k, v in values.items() if v not in (None, "")]),
            }
            if not args.live:
                result["updated"].append(preview)
                continue
            if not contact_id:
                contact_id = create_contact(headers, location_id, lead, email, phone)
                if contact_id:
                    supabase.table("leads").update({"ghl_contact_id": contact_id, "ghl_last_sync": datetime.now(timezone.utc).isoformat()}).eq("id", lead.get("id")).execute()
            if not contact_id:
                result["skipped"].append({**preview, "reason": "no_contact_id"})
                continue
            update_contact(headers, contact_id, fields_by_key, values)
            result["updated"].append({**preview, "contact_id": contact_id})
            time.sleep(0.25)
        except Exception as e:
            result["errors"].append({"queue_id": item.get("id"), "company": lead.get("company_name"), "error": str(e)})
    outdir = Path("/Users/gbot/.hermes/work/hermes-review")
    outdir.mkdir(parents=True, exist_ok=True)
    path = outdir / f"exotiq_ghl_mirror_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json"
    path.write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
    print(json.dumps({"ok": not result["errors"], "path": str(path), "live": args.live, "input_count": result["input_count"], "updated_count": len(result["updated"]), "skipped_count": len(result["skipped"]), "error_count": len(result["errors"]), "sample": result["updated"][:3], "errors": result["errors"][:3]}, indent=2, default=str))


if __name__ == "__main__":
    main()
