#!/usr/bin/env python3
"""Idempotently provision Exotiq sequence fields/tags in the verified GHL location."""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env.local")
load_dotenv(ROOT / "python-agent/.env")
API_KEY = os.getenv("GHL_API_KEY", "")
LOCATION_ID = os.getenv("GHL_LOCATION_ID", "")
BASE = "https://services.leadconnectorhq.com"
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Version": "2021-07-28",
    "Accept": "application/json",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 Chrome/126 Safari/537.36",
    "Origin": "https://app.gohighlevel.com",
    "Referer": "https://app.gohighlevel.com/",
}

FIELDS = [
    ("Exotiq Sequence Key", "TEXT", "Current deterministic sequence key"),
    ("Exotiq Sequence Batch", "TEXT", "Approved outreach batch identifier"),
    ("Exotiq Sequence Status", "TEXT", "active, paused, completed, exited, failed, or cancelled"),
    ("Exotiq Sequence Current Step", "TEXT", "Most recent sequence action"),
    ("Exotiq Sequence Next Action At", "TEXT", "ISO timestamp for next scheduled action"),
    ("Exotiq Sequence Sending Rail", "TEXT", "Email delivery provider used by the sequence"),
    ("Exotiq Sequence Exit Reason", "TEXT", "Reply, booking, unsubscribe, bounce, DND, customer, or manual hold"),
]
TAGS = [
    "brand:exotiq",
    "campaign:exotiq-founder-outreach-v1",
    "exotiq-sequence-active",
    "exotiq-sequence-engaged",
    "exotiq-sequence-suppressed",
    "exotiq-email-1-sent",
    "exotiq-call-task-created",
    "exotiq-instagram-task-created",
    "exotiq-email-2-sent",
    "exotiq-email-3-sent",
    "exotiq-email-close-sent",
    "batch:exotiq-sequence-demo",
]


def fail(message: str) -> None:
    print(json.dumps({"ok": False, "error": message}))
    raise SystemExit(1)


def main() -> None:
    if not API_KEY or not LOCATION_ID:
        fail("missing GHL_API_KEY or GHL_LOCATION_ID")
    location = requests.get(f"{BASE}/locations/{LOCATION_ID}", headers=HEADERS, timeout=30)
    if not location.ok:
        fail(f"location verification failed: HTTP {location.status_code}")
    location_name = (location.json().get("location") or location.json()).get("name")
    if location_name != "Exotiq Inc.":
        fail(f"wrong GHL location: {location_name!r}")

    field_response = requests.get(f"{BASE}/locations/{LOCATION_ID}/customFields", headers=HEADERS, timeout=30)
    field_response.raise_for_status()
    existing_fields = {f.get("name"): f for f in field_response.json().get("customFields", [])}
    tag_response = requests.get(f"{BASE}/locations/{LOCATION_ID}/tags", headers=HEADERS, timeout=30)
    tag_response.raise_for_status()
    existing_tags = {str(t.get("name") or "").lower(): t for t in tag_response.json().get("tags", [])}

    created_fields = []
    created_tags = []
    errors = []
    for name, data_type, placeholder in FIELDS:
        if name in existing_fields:
            continue
        response = requests.post(
            f"{BASE}/locations/{LOCATION_ID}/customFields",
            headers=HEADERS,
            json={"name": name, "dataType": data_type, "placeholder": placeholder, "model": "contact"},
            timeout=30,
        )
        if response.status_code in (200, 201):
            field = response.json().get("customField") or response.json()
            created_fields.append({"name": name, "id": field.get("id"), "fieldKey": field.get("fieldKey")})
        else:
            errors.append({"kind": "field", "name": name, "status": response.status_code, "body": response.text[:200]})
        time.sleep(0.15)

    for name in TAGS:
        if name.lower() in existing_tags:
            continue
        response = requests.post(f"{BASE}/locations/{LOCATION_ID}/tags", headers=HEADERS, json={"name": name}, timeout=30)
        if response.status_code in (200, 201):
            created_tags.append(name)
        else:
            errors.append({"kind": "tag", "name": name, "status": response.status_code, "body": response.text[:200]})
        time.sleep(0.1)

    final_fields = requests.get(f"{BASE}/locations/{LOCATION_ID}/customFields", headers=HEADERS, timeout=30).json().get("customFields", [])
    final_tags = requests.get(f"{BASE}/locations/{LOCATION_ID}/tags", headers=HEADERS, timeout=30).json().get("tags", [])
    required_fields = {name for name, _, _ in FIELDS}
    required_tags = {name.lower() for name in TAGS}
    found_fields = {f.get("name") for f in final_fields}
    found_tags = {str(t.get("name") or "").lower() for t in final_tags}
    output = {
        "ok": not errors and required_fields <= found_fields and required_tags <= found_tags,
        "location": location_name,
        "created_fields": created_fields,
        "created_tags": created_tags,
        "errors": errors,
        "required_fields_verified": len(required_fields & found_fields),
        "required_tags_verified": len(required_tags & found_tags),
        "verified_at": datetime.now(timezone.utc).isoformat(),
    }
    log_dir = Path.home() / ".hermes/work/hermes-review"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"exotiq_sequence_ghl_setup_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json"
    log_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    output["log_path"] = str(log_path)
    print(json.dumps(output, indent=2))
    if not output["ok"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
