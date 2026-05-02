"""
Enrichment Skill.

Processes the enrichment queue: finds leads with status='new',
triggers Apollo enrichment via the Next.js API, then processes
the result back into Supabase.

Design decision: I call the Next.js API endpoints rather than
hitting Apollo directly from Python. This keeps enrichment logic
in one place (TypeScript) and lets the dashboard track costs.
"""

import sys
from pathlib import Path

import requests
import time
from typing import Any

# Stage 3c: shared cost table so we attribute Apollo / OpenAI / etc.
sys.path.insert(0, str(Path(__file__).parent.parent))
from costs import PER_CALL_COSTS_CENTS  # noqa: E402

from db import get_db  # noqa: E402
from config import APP_BASE_URL, ENRICHMENT_BATCH_SIZE, RATE_LIMIT_DELAY  # noqa: E402

DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"


def process_enrichment_queue(
    tenant_id: str = DEFAULT_TENANT_ID,
    batch_size: int = ENRICHMENT_BATCH_SIZE,
) -> dict[str, Any]:
    """
    Find all new leads and trigger enrichment for each.
    Also processes any pending enrichment records to completion.
    """
    db = get_db()

    # Step 1: Find new leads that haven't been queued yet
    resp = db.table("leads")\
        .select("id, company_name, first_name, last_name, email, company_domain")\
        .eq("tenant_id", tenant_id)\
        .eq("status", "new")\
        .limit(batch_size)\
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
                    "process": True,  # Run Apollo synchronously
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

    cost_cents = triggered * PER_CALL_COSTS_CENTS["apollo_people_match"]
    summary = {
        "new_leads_found": len(new_leads),
        "triggered": triggered,
        "errors": errors,
        "leads_processed": triggered,
        "cost_cents": cost_cents,
    }
    print(f"Enrichment complete: {summary}")
    return summary


if __name__ == "__main__":
    process_enrichment_queue()
