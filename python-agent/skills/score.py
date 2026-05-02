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


def _activity_driven_lead_ids(db, tenant_id: str, lookback_hours: int = 24) -> list[str]:
    """Return lead_ids whose latest lead_activities.created_at is newer
    than the lead's own updated_at. We pull recent activity for the
    tenant in one PostgREST call, then group by lead_id taking the max
    created_at, and finally compare against the lead.updated_at.

    This closes the "responded lead never re-scored" feedback loop the
    master prompt describes (Phase 4 step 4)."""
    from datetime import datetime, timezone, timedelta

    since = (datetime.now(timezone.utc) - timedelta(hours=lookback_hours)).isoformat()
    act_resp = db.table("lead_activities")\
        .select("lead_id, created_at")\
        .eq("tenant_id", tenant_id)\
        .gte("created_at", since)\
        .order("created_at", desc=True)\
        .limit(2000)\
        .execute()

    latest_per_lead: dict[str, str] = {}
    for row in act_resp.data or []:
        lid = row.get("lead_id")
        ts = row.get("created_at")
        if not lid or not ts:
            continue
        if lid not in latest_per_lead or ts > latest_per_lead[lid]:
            latest_per_lead[lid] = ts

    if not latest_per_lead:
        return []

    # Look up lead.updated_at for the leads we found activity on. PostgREST
    # in_() takes a list, so we batch.
    out: list[str] = []
    lead_ids = list(latest_per_lead.keys())
    for chunk_start in range(0, len(lead_ids), 100):
        chunk = lead_ids[chunk_start : chunk_start + 100]
        leads_resp = db.table("leads")\
            .select("id, updated_at, status")\
            .eq("tenant_id", tenant_id)\
            .in_("id", chunk)\
            .execute()
        for lead in leads_resp.data or []:
            lid = lead["id"]
            # Don't re-score terminal leads.
            if lead.get("status") in ("lost", "disqualified", "converted"):
                continue
            lead_updated = lead.get("updated_at")
            activity_ts = latest_per_lead.get(lid)
            if not lead_updated or not activity_ts:
                continue
            if activity_ts > lead_updated:
                out.append(lid)
    return out


def process_scoring_queue(
    tenant_id: str = DEFAULT_TENANT_ID,
    batch_size: int = SCORING_BATCH_SIZE,
) -> dict[str, Any]:
    """
    Score leads that need scoring. Three pickup paths:

      1. Status == 'enriching' AND has a completed enrichment row
         (the original autonomous-pipeline path).
      2. score_breakdown.composite is NULL (Stage 1d guard) — covers
         migrated leads, manual inserts, and any lead the engine has
         never seen.
      3. Latest lead_activities.created_at > lead.updated_at within the
         last 24h (Stage 2d) — closes the "responded lead never
         re-scored" feedback loop. Triggered by GHL inbound polling
         updating activities, by the outreach mark_sent activity log,
         and by webhook activity inserts.

    The three queries are unioned client-side; status='enriching' wins
    ties because it has its own enrichment-completed gate.
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

    # New cohort: activity newer than updated_at.
    activity_driven_ids = _activity_driven_lead_ids(db, tenant_id)
    activity_driven_leads: list[dict] = []
    if activity_driven_ids:
        # Fetch the same shape the other paths use, so the loop body is
        # uniform.
        for chunk_start in range(0, len(activity_driven_ids), 100):
            chunk = activity_driven_ids[chunk_start : chunk_start + 100]
            ad_resp = db.table("leads")\
                .select("id, company_name, status, score_breakdown")\
                .eq("tenant_id", tenant_id)\
                .in_("id", chunk)\
                .execute()
            activity_driven_leads.extend(ad_resp.data or [])

    # Dedup by id; status == 'enriching' wins ties because it has the
    # enrichment-completed gate downstream.
    by_id: dict[str, dict] = {}
    for l in activity_driven_leads:
        by_id[l["id"]] = l
    for l in missing_leads:
        by_id[l["id"]] = l
    for l in enriching_leads:
        by_id[l["id"]] = l
    leads_to_score = list(by_id.values())[:batch_size]

    scored = 0
    skipped_no_enrichment = 0
    skipped_already_composite = 0
    errors = 0
    activity_count = len(activity_driven_ids)

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
        "activity_driven_candidates": activity_count,
        "errors": errors,
        "leads_processed": scored,
        # Scoring uses internal SQL helpers + the TS engine endpoint; no
        # external paid API calls per scoring run today.
        "cost_cents": 0,
    }
    print(f"Scoring complete: {summary}")
    return summary


if __name__ == "__main__":
    process_scoring_queue()
