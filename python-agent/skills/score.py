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


def _has_composite(score_breakdown: Any) -> bool:
    """True if score_breakdown is a dict carrying a composite key.

    The TS scoring engine always writes composite into score_breakdown
    when it runs. So a lead whose score_breakdown.composite is set has
    been through the real engine; one without it is either fresh or was
    score-mapped from migration data (see scripts/migrate_exotiq.py)."""
    if not isinstance(score_breakdown, dict):
        return False
    return score_breakdown.get("composite") is not None


def process_scoring_queue(
    tenant_id: str = DEFAULT_TENANT_ID,
    batch_size: int = SCORING_BATCH_SIZE,
) -> dict[str, Any]:
    """
    Score leads that need scoring. Two pickup paths:

      1. Status == 'enriching' AND has a completed enrichment row
         (the original autonomous-pipeline path).
      2. score_breakdown.composite is NULL (Stage 1d guard) — covers
         migrated leads, manual inserts, and any lead the engine has
         never seen. Prevents the "stale scores" gap forever.

    The two queries are unioned client-side.
    """
    db = get_db()

    enriching_resp = db.table("leads")\
        .select("id, company_name, status, score_breakdown")\
        .eq("tenant_id", tenant_id)\
        .eq("status", "enriching")\
        .limit(batch_size)\
        .execute()
    enriching_leads = enriching_resp.data or []

    # Pull a wider page for the composite-missing scan. Postgres has no
    # convenient "score_breakdown ?? 'composite' is null" filter via the
    # PostgREST API, so we fetch a window and filter in Python.
    missing_resp = db.table("leads")\
        .select("id, company_name, status, score_breakdown")\
        .eq("tenant_id", tenant_id)\
        .neq("status", "lost")\
        .neq("status", "disqualified")\
        .order("updated_at", desc=True)\
        .limit(batch_size * 4)\
        .execute()
    missing_leads = [
        l for l in (missing_resp.data or [])
        if not _has_composite(l.get("score_breakdown"))
    ]

    # Dedup by id; status == 'enriching' candidates take priority.
    by_id: dict[str, dict] = {l["id"]: l for l in missing_leads}
    for l in enriching_leads:
        by_id[l["id"]] = l
    leads_to_score = list(by_id.values())[:batch_size]

    scored = 0
    skipped_no_enrichment = 0
    skipped_already_composite = 0
    errors = 0

    for lead in leads_to_score:
        # Status == 'enriching' still requires a completed enrichment
        # row. Other status values (e.g. 'scored' missing composite
        # because of migration import) skip the enrichment gate.
        if lead.get("status") == "enriching":
            enrichment_check = db.table("enrichments")\
                .select("id")\
                .eq("lead_id", lead["id"])\
                .eq("status", "completed")\
                .limit(1)\
                .execute()
            if not enrichment_check.data:
                skipped_no_enrichment += 1
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
        "skipped_no_enrichment": skipped_no_enrichment,
        "skipped_already_composite": skipped_already_composite,
        "errors": errors,
    }
    print(f"Scoring complete: {summary}")
    return summary


if __name__ == "__main__":
    process_scoring_queue()
