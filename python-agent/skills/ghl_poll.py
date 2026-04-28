"""
GHL Polling Skill.

Every time this runs, it:
  1. Fetches recent conversations from GoHighLevel
  2. Identifies new inbound messages (replies from leads)
  3. Matches each message to a lead in Supabase (by GHL contact ID or email)
  4. Creates a lead_activities record
  5. If the message is a reply, bumps the lead's status to 'engaged'

This replaces what a webhook would normally do -- we pull instead of
waiting to be pushed. GHL doesn't charge per API call, and we're nowhere
near the rate limits (100 calls per 10 seconds).

Runs as part of the main orchestrator every 15 minutes.
"""

import os
import sys
import time
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import config first so .env gets loaded via dotenv
from config import RATE_LIMIT_DELAY  # noqa: F401
from db import get_db

GHL_API_KEY = os.environ.get("GHL_API_KEY", "")
GHL_LOCATION_ID = os.environ.get("GHL_LOCATION_ID", "")
GHL_API_BASE = "https://services.leadconnectorhq.com"
DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"


def _ghl_headers() -> dict:
    return {
        "Authorization": f"Bearer {GHL_API_KEY}",
        "Version": "2021-04-15",
        "Accept": "application/json",
    }


def _get_last_poll_time(tenant_id: str) -> datetime:
    """Get the timestamp of the last successful GHL poll for this tenant."""
    db = get_db()
    resp = db.table("agent_runs")\
        .select("completed_at")\
        .eq("tenant_id", tenant_id)\
        .eq("agent_type", "ghl_poll")\
        .eq("status", "completed")\
        .order("completed_at", desc=True)\
        .limit(1)\
        .execute()

    if resp.data:
        return datetime.fromisoformat(resp.data[0]["completed_at"].replace("Z", "+00:00"))

    # First run -- look back 24 hours
    return datetime.now(timezone.utc) - timedelta(hours=24)


def _fetch_conversations_since(since: datetime) -> list[dict]:
    """Fetch conversations that have new activity since the given timestamp."""
    url = f"{GHL_API_BASE}/conversations/search"
    params = {
        "locationId": GHL_LOCATION_ID,
        "limit": 100,
        "sort": "desc",
        "sortBy": "last_message_date",
    }

    try:
        r = requests.get(url, headers=_ghl_headers(), params=params, timeout=15)
        if r.status_code != 200:
            print(f"  ! GHL conversations fetch failed: {r.status_code} {r.text[:200]}")
            return []

        conversations = r.json().get("conversations", [])

        # Filter to only those with activity after `since`
        since_ms = int(since.timestamp() * 1000)
        return [
            c for c in conversations
            if c.get("lastMessageDate", 0) >= since_ms
        ]
    except Exception as e:
        print(f"  ! Conversations fetch error: {e}")
        return []


def _fetch_messages_for_conversation(conv_id: str) -> list[dict]:
    """Get messages in a specific conversation."""
    url = f"{GHL_API_BASE}/conversations/{conv_id}/messages"
    try:
        r = requests.get(url, headers=_ghl_headers(), timeout=15)
        if r.status_code != 200:
            return []
        return r.json().get("messages", {}).get("messages", [])
    except Exception as e:
        print(f"  ! Messages fetch error for conv {conv_id}: {e}")
        return []


def _find_lead_for_contact(
    tenant_id: str,
    ghl_contact_id: str,
    email: Optional[str],
) -> Optional[str]:
    """Find a lead in Supabase matching a GHL contact. Returns lead ID or None."""
    db = get_db()

    # Try by GHL contact ID first
    if ghl_contact_id:
        resp = db.table("leads")\
            .select("id")\
            .eq("tenant_id", tenant_id)\
            .eq("ghl_contact_id", ghl_contact_id)\
            .limit(1)\
            .execute()
        if resp.data:
            return resp.data[0]["id"]

    # Fallback to email match
    if email:
        resp = db.table("leads")\
            .select("id")\
            .eq("tenant_id", tenant_id)\
            .ilike("email", email)\
            .limit(1)\
            .execute()
        if resp.data:
            # Backfill the GHL contact ID while we're here
            if ghl_contact_id:
                db.table("leads").update({"ghl_contact_id": ghl_contact_id})\
                    .eq("id", resp.data[0]["id"]).execute()
            return resp.data[0]["id"]

    return None


def _activity_already_logged(lead_id: str, ghl_message_id: str) -> bool:
    """Check if we've already logged this message to avoid duplicates."""
    db = get_db()
    resp = db.table("lead_activities")\
        .select("id")\
        .eq("lead_id", lead_id)\
        .contains("metadata", {"ghl_message_id": ghl_message_id})\
        .limit(1)\
        .execute()
    return bool(resp.data)


def _log_activity_and_update_lead(
    tenant_id: str,
    lead_id: str,
    message: dict,
) -> None:
    """Create a lead_activity record and bump the lead to 'engaged' on inbound."""
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()

    direction = message.get("direction", "inbound")
    msg_type = message.get("messageType", "SMS")
    is_inbound = direction == "inbound"

    activity_type = "dm_replied" if is_inbound else "dm_sent"
    if msg_type == "Email":
        activity_type = "email_replied" if is_inbound else "email_sent"
    elif msg_type == "Call":
        activity_type = "call_made"

    channel = "ghl"
    if msg_type == "SMS":
        channel = "sms"
    elif msg_type == "Email":
        channel = "email"

    db.table("lead_activities").insert({
        "tenant_id": tenant_id,
        "lead_id": lead_id,
        "activity_type": activity_type,
        "channel": channel,
        "metadata": {
            "ghl_message_id": message.get("id"),
            "ghl_conversation_id": message.get("conversationId"),
            "direction": direction,
            "message_type": msg_type,
            "body": (message.get("body") or "")[:1000],
        },
    }).execute()

    # If inbound, bump lead to engaged
    if is_inbound:
        db.table("leads").update({
            "status": "engaged",
            "last_activity_at": now,
            "ghl_last_sync": now,
            "updated_at": now,
        }).eq("id", lead_id).eq("tenant_id", tenant_id).execute()


def poll_ghl(tenant_id: str = DEFAULT_TENANT_ID) -> dict[str, Any]:
    """Main polling entrypoint."""
    if not GHL_API_KEY or not GHL_LOCATION_ID:
        return {"status": "skipped", "reason": "GHL_API_KEY or GHL_LOCATION_ID not configured"}

    since = _get_last_poll_time(tenant_id)
    print(f"Polling GHL since {since.isoformat()}")

    conversations = _fetch_conversations_since(since)
    print(f"  {len(conversations)} conversations with recent activity")

    new_messages = 0
    matched_leads = 0
    orphan_messages = 0

    for conv in conversations:
        conv_id = conv.get("id")
        contact_id = conv.get("contactId")
        email = conv.get("email")

        if not conv_id:
            continue

        lead_id = _find_lead_for_contact(tenant_id, contact_id, email)

        if not lead_id:
            orphan_messages += 1
            continue

        messages = _fetch_messages_for_conversation(conv_id)
        for msg in messages:
            msg_id = msg.get("id")
            if not msg_id:
                continue

            # Only process messages after our last poll
            msg_date_ms = msg.get("dateAdded", 0)
            if msg_date_ms < int(since.timestamp() * 1000):
                continue

            if _activity_already_logged(lead_id, msg_id):
                continue

            _log_activity_and_update_lead(tenant_id, lead_id, msg)
            new_messages += 1
            matched_leads += 1

        time.sleep(RATE_LIMIT_DELAY)  # Be kind to GHL API

    summary = {
        "conversations_checked": len(conversations),
        "new_messages_logged": new_messages,
        "leads_matched": matched_leads,
        "orphan_conversations": orphan_messages,
    }
    print(f"GHL poll complete: {summary}")
    return summary


if __name__ == "__main__":
    print(poll_ghl())
