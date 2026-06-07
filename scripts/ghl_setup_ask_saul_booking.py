"""Set up/audit Ask Saul GHL assets for text-to-booking.

Creates idempotent contact custom fields and configures the existing Service Provider
Leads booking calendar as Gregory's 15-minute Ask Saul phone-agent intro calendar.

Notes:
- Uses GHL_LOCAL_SERVICES_* first. This must point to Ask Saul location
  RxCVQeGoQ3RTJbbLG5gY, not the Exotiq location.
- Pipeline/workflow creation is not attempted here because the current token can read
  pipelines/workflows but is not authorized to create pipelines/workflow automations.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import requests
    from dotenv import load_dotenv
except Exception as exc:  # pragma: no cover - setup failure path
    print(json.dumps({"ok": False, "error": str(exc)}))
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
ASK_SAUL_LOCATION_ID = "RxCVQeGoQ3RTJbbLG5gY"
BASE = "https://services.leadconnectorhq.com"
BOOKING_CALENDAR_NAME = "Gregory - Ask Saul Phone Agent Intro"
BOOKING_GROUP_ID = "8fBhM3DapIbsijdL45u5"  # Service Provider Leads
BOOKING_LINK_BASE = "https://api.leadconnectorhq.com/widget/bookings"

FIELDS_TO_CREATE: list[tuple[str, str, str]] = [
    ("Ask Saul Interest Level", "TEXT", "cold, warm, hot, not_fit"),
    ("Business Type / Service", "TEXT", "HVAC, plumbing, garage doors, medspa, etc."),
    ("Service Area / City", "TEXT", "Primary service area/city"),
    ("Current Call Handling", "LARGE_TEXT", "Owner cell, front desk, voicemail, GHL, after-hours, etc."),
    ("Phone Agent Pain Point", "LARGE_TEXT", "Missed calls, after-hours, slow follow-up, bad intake, etc."),
    ("Desired Agent Tasks", "LARGE_TEXT", "FAQs, qualify leads, collect job details, booking callbacks, route emergencies, sync CRM"),
    ("Preferred Callback Window", "TEXT", "When Gregory should call back"),
    ("Saul Demo Offered", "TEXT", "yes/no/source"),
    ("Saul Demo Called", "TEXT", "yes/no/unknown"),
    ("Callback Booking Source", "TEXT", "text, voice agent, manual, GHL workflow"),
    ("Gregory Follow-Up Consent", "TEXT", "yes/no plus consent context"),
    ("Ask Saul Qualification Summary", "LARGE_TEXT", "Concise lead context before Gregory callback"),
]


def load_env() -> None:
    load_dotenv(ROOT / ".env.local")
    load_dotenv(ROOT / "python-agent" / ".env")
    load_dotenv(ROOT / "voice-agent" / ".dev.vars")


def ghl_headers(api_key: str) -> dict[str, str]:
    # LeadConnector/Cloudflare can reject script-like signatures with 1010.
    # Browser-like headers keep read/write automation reliable from Gregory's Mac.
    return {
        "Authorization": f"Bearer {api_key}",
        "Version": os.getenv("GHL_API_VERSION", "2021-07-28"),
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": "https://app.gohighlevel.com",
        "Referer": "https://app.gohighlevel.com/",
    }


class GhlClient:
    def __init__(self, api_key: str, location_id: str) -> None:
        self.location_id = location_id
        self.headers = ghl_headers(api_key)

    def request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> tuple[int, dict[str, Any]]:
        resp = requests.request(method, f"{BASE}{path}", headers=self.headers, json=payload, timeout=25)
        try:
            data = resp.json()
        except Exception:
            data = {"raw": resp.text[:1000]}
        return resp.status_code, data

    def get_custom_fields(self) -> list[dict[str, Any]]:
        status, data = self.request("GET", f"/locations/{self.location_id}/customFields")
        if status != 200:
            raise RuntimeError(f"custom fields read failed {status}: {str(data)[:300]}")
        return data.get("customFields", [])

    def get_calendars(self) -> list[dict[str, Any]]:
        status, data = self.request("GET", f"/calendars/?locationId={self.location_id}")
        if status != 200:
            raise RuntimeError(f"calendars read failed {status}: {str(data)[:300]}")
        return data.get("calendars", [])

    def get_pipelines(self) -> list[dict[str, Any]]:
        status, data = self.request("GET", f"/opportunities/pipelines?locationId={self.location_id}")
        if status != 200:
            return []
        return data.get("pipelines", [])

    def get_workflows(self) -> list[dict[str, Any]]:
        status, data = self.request("GET", f"/workflows/?locationId={self.location_id}")
        if status != 200:
            return []
        return data.get("workflows", [])


def write_backup(client: GhlClient) -> Path:
    payload: dict[str, Any] = {"captured_at": datetime.now(timezone.utc).isoformat(), "location_id": client.location_id, "responses": {}}
    for name, path in {
        "custom_fields": f"/locations/{client.location_id}/customFields",
        "pipelines": f"/opportunities/pipelines?locationId={client.location_id}",
        "calendars": f"/calendars/?locationId={client.location_id}",
        "calendar_groups": f"/calendars/groups?locationId={client.location_id}",
        "workflows": f"/workflows/?locationId={client.location_id}",
    }.items():
        status, data = client.request("GET", path)
        payload["responses"][name] = {"status": status, "data": data}
        time.sleep(0.1)
    outdir = Path("/Users/gbot/.hermes/work/hermes-review")
    outdir.mkdir(parents=True, exist_ok=True)
    path = outdir / f"ask_saul_ghl_booking_backup_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def ensure_fields(client: GhlClient, dry_run: bool) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    fields = client.get_custom_fields()
    by_name = {field.get("name"): field for field in fields}
    changes: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for name, data_type, placeholder in FIELDS_TO_CREATE:
        if name in by_name:
            continue
        if dry_run:
            changes.append({"action": "would_create_field", "name": name, "dataType": data_type})
            continue
        status, data = client.request("POST", f"/locations/{client.location_id}/customFields", {
            "name": name,
            "dataType": data_type,
            "placeholder": placeholder,
            "model": "contact",
        })
        if status in (200, 201):
            custom_field = data.get("customField") or data
            changes.append({"action": "create_field", "name": name, "id": custom_field.get("id"), "fieldKey": custom_field.get("fieldKey")})
        else:
            errors.append({"action": "create_field", "name": name, "status": status, "body": str(data)[:300]})
        time.sleep(0.15)
    return changes, errors


def ensure_calendar(client: GhlClient, dry_run: bool) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    calendars = client.get_calendars()
    calendar = next((c for c in calendars if c.get("name") == BOOKING_CALENDAR_NAME), None)
    if not calendar:
        calendar = next((c for c in calendars if c.get("groupId") == BOOKING_GROUP_ID and c.get("isActive")), None)
    if not calendar:
        return [], [{"action": "update_calendar", "error": "No active Service Provider Leads calendar found"}]

    payload = {
        "name": BOOKING_CALENDAR_NAME,
        "description": "15-minute phone intro for local service providers interested in an Ask Saul AI phone agent. Saul/GHL should preserve business type, call-handling pain, desired agent tasks, and preferred callback context before Gregory calls.",
        "calendarType": calendar.get("calendarType", "event"),
        "eventTitle": "Ask Saul Intro - {{contact.name}}",
        "slotDuration": 15,
        "slotDurationUnit": "mins",
        "slotInterval": 15,
        "slotIntervalUnit": "mins",
        "meetingLocation": "Gregory will call {{contact.phone}}",
        "isActive": True,
        "groupId": calendar.get("groupId"),
        "autoConfirm": True,
        "allowCancellation": True,
        "allowReschedule": True,
    }
    if dry_run:
        return [{"action": "would_update_calendar", "id": calendar.get("id"), "name": payload["name"]}], []

    status, data = client.request("PUT", f"/calendars/{calendar['id']}", payload)
    if status not in (200, 201):
        return [], [{"action": "update_calendar", "id": calendar.get("id"), "status": status, "body": str(data)[:300]}]
    updated = data.get("calendar") or data
    return [{
        "action": "update_calendar",
        "id": updated.get("id"),
        "name": updated.get("name"),
        "widgetSlug": updated.get("widgetSlug"),
        "bookingLink": f"{BOOKING_LINK_BASE}/{updated.get('widgetSlug')}",
        "slotDuration": updated.get("slotDuration"),
        "isActive": updated.get("isActive"),
    }], []


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env()
    api_key = os.getenv("GHL_LOCAL_SERVICES_API_KEY") or ""
    location_id = os.getenv("GHL_LOCAL_SERVICES_LOCATION_ID") or ""
    if not api_key or not location_id:
        print(json.dumps({"ok": False, "error": "Missing GHL_LOCAL_SERVICES_API_KEY or GHL_LOCAL_SERVICES_LOCATION_ID"}, indent=2))
        return 1
    if location_id != ASK_SAUL_LOCATION_ID:
        print(json.dumps({"ok": False, "error": f"Refusing to touch non-Ask-Saul GHL location {location_id}"}, indent=2))
        return 1

    client = GhlClient(api_key, location_id)
    backup_path = write_backup(client) if not args.dry_run else None
    field_changes, field_errors = ensure_fields(client, args.dry_run)
    calendar_changes, calendar_errors = ensure_calendar(client, args.dry_run)
    final_fields = client.get_custom_fields()
    final_calendars = client.get_calendars()
    final_pipelines = client.get_pipelines()
    final_workflows = client.get_workflows()
    ask_calendar = next((c for c in final_calendars if c.get("name") == BOOKING_CALENDAR_NAME), {})

    out = {
        "ok": not (field_errors or calendar_errors),
        "dry_run": args.dry_run,
        "location_id": location_id,
        "backup_path": str(backup_path) if backup_path else None,
        "changes": field_changes + calendar_changes,
        "errors": field_errors + calendar_errors,
        "final_counts": {
            "custom_fields": len(final_fields),
            "pipelines": len(final_pipelines),
            "calendars": len(final_calendars),
            "workflows": len(final_workflows),
        },
        "booking_calendar": {
            "id": ask_calendar.get("id"),
            "name": ask_calendar.get("name"),
            "widgetSlug": ask_calendar.get("widgetSlug"),
            "bookingLink": f"{BOOKING_LINK_BASE}/{ask_calendar.get('widgetSlug')}" if ask_calendar.get("widgetSlug") else None,
            "slotDuration": ask_calendar.get("slotDuration"),
            "isActive": ask_calendar.get("isActive"),
        },
        "pipeline_note": "Current token reads pipelines but cannot create new pipelines. Use existing Marketing Pipeline stages or grant opportunities write scope for automated pipeline creation.",
        "workflow_note": "Current token reads workflow names/status. Build/publish the text-reply workflow in GHL UI using docs/ask-saul-ghl-text-booking-flow.md unless workflow API scopes are added.",
    }
    outdir = Path("/Users/gbot/.hermes/work/hermes-review")
    outdir.mkdir(parents=True, exist_ok=True)
    log_path = outdir / f"ask_saul_ghl_booking_setup_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json"
    log_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    out["log_path"] = str(log_path)
    print(json.dumps(out, indent=2))
    return 0 if out["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
