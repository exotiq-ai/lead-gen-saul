"""
Enrichment Skill.

Processes the enrichment queue: finds leads with status='new',
triggers Apollo enrichment via the Next.js API, then processes
the result back into Supabase.

Design decision: I call the Next.js API endpoints rather than
hitting Apollo directly from Python. This keeps enrichment logic
in one place (TypeScript) and lets the dashboard track costs.

Cost cap: Apollo /people/match is ~12¢/call (see costs.py). To
prevent a runaway cron from spending unbounded amounts we apply
a per-tenant daily budget from APOLLO_DAILY_BUDGET_CENTS. We sum
this tenant's completed enrichment cost_cents since UTC midnight
from agent_runs and stop dispatching once we've reached the cap.
"""

import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

sys.path.insert(0, str(Path(__file__).parent.parent))
from costs import PER_CALL_COSTS_CENTS  # noqa: E402

from db import get_db  # noqa: E402
from config import (  # noqa: E402
    APP_BASE_URL,
    APOLLO_DAILY_BUDGET_CENTS,
    ENRICHMENT_BATCH_SIZE,
    RATE_LIMIT_DELAY,
)

DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"


def _spent_today_cents(tenant_id: str) -> int:
    """Sum enrichment cost_cents already booked for this tenant since UTC midnight."""
    try:
        db = get_db()
        today_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        ).isoformat()
        resp = db.table("agent_runs")\
            .select("cost_cents")\
            .eq("tenant_id", tenant_id)\
            .eq("agent_type", "enrichment")\
            .eq("status", "completed")\
            .gte("completed_at", today_start)\
            .execute()
        return sum(int(row.get("cost_cents") or 0) for row in (resp.data or []))
    except Exception as e:
        print(f"  ! daily budget lookup failed (failing open): {e}")
        return 0


def process_enrichment_queue(
    tenant_id: str = DEFAULT_TENANT_ID,
    batch_size: int = ENRICHMENT_BATCH_SIZE,
) -> dict[str, Any]:
    """
    Find all new leads and trigger enrichment for each.
    Also processes any pending enrichment records to completion.
    """
    db = get_db()

    cap = APOLLO_DAILY_BUDGET_CENTS
    already_spent = _spent_today_cents(tenant_id) if cap > 0 else 0
    per_call = PER_CALL_COSTS_CENTS["apollo_people_match"]
    if cap > 0 and already_spent >= cap:
        summary = {
            "skipped": True,
            "reason": f"daily_budget_reached_{already_spent}_of_{cap}c",
            "new_leads_found": 0,
            "triggered": 0,
            "errors": 0,
            "leads_processed": 0,
            "cost_cents": 0,
        }
        print(f"Enrichment skipped (budget cap): {summary}")
        return summary

    # Number of additional calls we can afford this cycle (per the cap).
    remaining_calls = batch_size
    if cap > 0 and per_call > 0:
        affordable = max(0, (cap - already_spent) // per_call)
        remaining_calls = min(batch_size, affordable)

    if remaining_calls <= 0:
        summary = {
            "skipped": True,
            "reason": "no_calls_affordable_under_cap",
            "new_leads_found": 0,
            "triggered": 0,
            "errors": 0,
            "leads_processed": 0,
            "cost_cents": 0,
        }
        print(f"Enrichment skipped (budget cap): {summary}")
        return summary

    resp = db.table("leads")\
        .select("id, company_name, first_name, last_name, email, company_domain")\
        .eq("tenant_id", tenant_id)\
        .eq("status", "new")\
        .limit(remaining_calls)\
        .execute()

    new_leads = resp.data or []
    triggered = 0
    errors = 0

    for lead in new_leads:
        try:
            r = requests.post(
                f"{APP_BASE_URL}/api/enrichment/trigger",
                json={
                    "lead_id": lead["id"],
                    "tenant_id": tenant_id,
                    "process": True,
                },
                timeout=30,
            )
            if r.status_code == 200:
                triggered += 1
            else:
                print(f"  ! Enrichment trigger failed for {lead['company_name']}: {r.status_code} {r.text[:100]}")
                errors += 1
        except Exception as e:
            print(f"  ! Enrichment error for {lead['company_name']}: {e}")
            errors += 1

        time.sleep(RATE_LIMIT_DELAY)

    cost_cents = triggered * per_call
    summary = {
        "new_leads_found": len(new_leads),
        "triggered": triggered,
        "errors": errors,
        "leads_processed": triggered,
        "cost_cents": cost_cents,
        "daily_spent_cents": already_spent + cost_cents,
        "daily_cap_cents": cap,
    }
    print(f"Enrichment complete: {summary}")
    return summary


if __name__ == "__main__":
    process_enrichment_queue()
