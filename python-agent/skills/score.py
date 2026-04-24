"""
Scoring Skill.

Finds all leads that have completed enrichment (status='enriching'
with a completed enrichment record) and triggers scoring for each.
"""

import requests
import time
from typing import Any

from db import get_db
from config import APP_BASE_URL, SCORING_BATCH_SIZE, RATE_LIMIT_DELAY

DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"


def process_scoring_queue(
    tenant_id: str = DEFAULT_TENANT_ID,
    batch_size: int = SCORING_BATCH_SIZE,
) -> dict[str, Any]:
    """
    Find all enriched leads that haven't been scored yet and score them.
    """
    db = get_db()

    # Find leads that are in 'enriching' status but have a completed enrichment
    resp = db.table("leads")\
        .select("id, company_name")\
        .eq("tenant_id", tenant_id)\
        .eq("status", "enriching")\
        .limit(batch_size)\
        .execute()

    leads_to_score = resp.data or []

    # Filter to only those with a completed enrichment record
    scored = 0
    skipped = 0
    errors = 0

    for lead in leads_to_score:
        enrichment_check = db.table("enrichments")\
            .select("id")\
            .eq("lead_id", lead["id"])\
            .eq("status", "completed")\
            .limit(1)\
            .execute()

        if not enrichment_check.data:
            skipped += 1
            continue

        try:
            r = requests.post(
                f"{APP_BASE_URL}/api/scoring/calculate",
                json={
                    "lead_id": lead["id"],
                    "tenant_id": tenant_id,
                },
                timeout=15,
            )
            if r.status_code == 200:
                scored += 1
            else:
                print(f"  ! Scoring failed for {lead['company_name']}: {r.status_code}")
                errors += 1
        except Exception as e:
            print(f"  ! Scoring error for {lead['company_name']}: {e}")
            errors += 1

        time.sleep(0.2)

    summary = {
        "leads_found": len(leads_to_score),
        "scored": scored,
        "skipped_no_enrichment": skipped,
        "errors": errors,
    }
    print(f"Scoring complete: {summary}")
    return summary


if __name__ == "__main__":
    process_scoring_queue()
