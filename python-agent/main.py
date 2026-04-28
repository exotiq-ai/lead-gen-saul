"""
Saul Agent Service -- Master Orchestrator

This is the autonomous pipeline engine. It runs on a 15-minute cron
and executes the full lead pipeline loop:

  Discover -> Enrich -> Score -> Draft -> Repeat

Design principles:
- Every step logs what it did and any errors.
- A failure in one step never crashes the others.
- The pipeline is idempotent: re-running it is always safe.
- Human approval is required before any outreach is sent.
  Gregory or Ariella clicks Approve in the dashboard.
  Nothing goes out automatically.

This is Phase 1 of the autonomous pipeline.
Phase 2 (auto-send after template trust established) comes later.
"""

import logging
import time
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import schedule

from db import get_db
from config import SUPABASE_URL
from skills.discover import discover_leads
from skills.enrich import process_enrichment_queue
from skills.enrich_gmaps import process_gmaps_enrichment
from skills.score import process_scoring_queue
from skills.draft import draft_outreach
from skills.ghl_poll import poll_ghl

# Logging setup: structured JSON lines for easy ingestion
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    stream=sys.stdout,
)

DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"
MEDSPA_TENANT_ID = "11111111-1111-1111-1111-111111111111"
ALL_TENANTS = [DEFAULT_TENANT_ID, MEDSPA_TENANT_ID]
RUN_DISCOVERY_EVERY_N_CYCLES = 4  # Discover new leads every 4 cycles (~1 hour)
_cycle_count = 0


def _log(event: str, data: dict = None):
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": event,
        **(data or {}),
    }
    print(json.dumps(entry))


def log_agent_run(tenant_id: str, agent_type: str, status: str, data: dict, duration_ms: int):
    """Write an agent_runs record to Supabase for the dashboard."""
    try:
        db = get_db()
        db.table("agent_runs").insert({
            "tenant_id": tenant_id,
            "agent_type": agent_type,
            "status": status,
            "output_data": data,
            "duration_ms": duration_ms,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        _log("agent_run_log_error", {"error": str(e)})


def run_pipeline(tenant_id: str = DEFAULT_TENANT_ID):
    """
    Execute the full pipeline cycle.
    Each step is wrapped in a try/except so one failure
    doesn't abort the rest of the pipeline.
    """
    global _cycle_count
    _cycle_count += 1
    cycle_start = time.time()

    _log("pipeline_start", {"cycle": _cycle_count, "tenant_id": tenant_id})

    # -----------------------------------------------------------------------
    # Step 1: Discovery (runs every N cycles to avoid hammering search APIs)
    # -----------------------------------------------------------------------
    if _cycle_count % RUN_DISCOVERY_EVERY_N_CYCLES == 1:
        _log("step_start", {"step": "discover"})
        t = time.time()
        try:
            discovery_result = discover_leads(tenant_id=tenant_id)
            log_agent_run(tenant_id, "sourcing", "completed", discovery_result, int((time.time() - t) * 1000))
            _log("step_complete", {"step": "discover", **discovery_result})
        except Exception as e:
            _log("step_error", {"step": "discover", "error": str(e)})
            log_agent_run(tenant_id, "sourcing", "failed", {"error": str(e)}, int((time.time() - t) * 1000))
    else:
        _log("step_skipped", {"step": "discover", "reason": f"cycle {_cycle_count} mod {RUN_DISCOVERY_EVERY_N_CYCLES} != 1"})

    # -----------------------------------------------------------------------
    # Step 2: Enrichment -- queue new leads into Apollo (or Google Maps for MedSpa)
    # -----------------------------------------------------------------------
    _log("step_start", {"step": "enrich"})
    t = time.time()
    try:
        if tenant_id == MEDSPA_TENANT_ID:
            enrich_result = process_gmaps_enrichment(tenant_id=tenant_id)
        else:
            enrich_result = process_enrichment_queue(tenant_id=tenant_id)
        log_agent_run(tenant_id, "enrichment", "completed", enrich_result, int((time.time() - t) * 1000))
        _log("step_complete", {"step": "enrich", **enrich_result})
    except Exception as e:
        _log("step_error", {"step": "enrich", "error": str(e)})
        log_agent_run(tenant_id, "enrichment", "failed", {"error": str(e)}, int((time.time() - t) * 1000))

    # -----------------------------------------------------------------------
    # Step 3: Scoring -- score leads that completed enrichment
    # -----------------------------------------------------------------------
    _log("step_start", {"step": "score"})
    t = time.time()
    try:
        score_result = process_scoring_queue(tenant_id=tenant_id)
        log_agent_run(tenant_id, "scoring", "completed", score_result, int((time.time() - t) * 1000))
        _log("step_complete", {"step": "score", **score_result})
    except Exception as e:
        _log("step_error", {"step": "score", "error": str(e)})
        log_agent_run(tenant_id, "scoring", "failed", {"error": str(e)}, int((time.time() - t) * 1000))

    # -----------------------------------------------------------------------
    # Step 3.5: GHL polling -- pick up replies and new activity from GHL
    # -----------------------------------------------------------------------
    _log("step_start", {"step": "ghl_poll"})
    t = time.time()
    try:
        ghl_result = poll_ghl(tenant_id=tenant_id)
        log_agent_run(tenant_id, "ghl_poll", "completed", ghl_result, int((time.time() - t) * 1000))
        _log("step_complete", {"step": "ghl_poll", **ghl_result})
    except Exception as e:
        _log("step_error", {"step": "ghl_poll", "error": str(e)})
        log_agent_run(tenant_id, "ghl_poll", "failed", {"error": str(e)}, int((time.time() - t) * 1000))

    # -----------------------------------------------------------------------
    # Step 4: Draft outreach for qualified leads
    # -----------------------------------------------------------------------
    _log("step_start", {"step": "draft"})
    t = time.time()
    try:
        draft_result = draft_outreach(tenant_id=tenant_id)
        log_agent_run(tenant_id, "outreach", "completed", draft_result, int((time.time() - t) * 1000))
        _log("step_complete", {"step": "draft", **draft_result})
    except Exception as e:
        _log("step_error", {"step": "draft", "error": str(e)})
        log_agent_run(tenant_id, "outreach", "failed", {"error": str(e)}, int((time.time() - t) * 1000))

    # -----------------------------------------------------------------------
    # Done
    # -----------------------------------------------------------------------
    total_ms = int((time.time() - cycle_start) * 1000)
    _log("pipeline_complete", {
        "cycle": _cycle_count,
        "duration_ms": total_ms,
        "next_run_in": "15m",
    })


def main():
    _log("agent_service_start", {
        "supabase_url": SUPABASE_URL,
        "schedule": "every 15 minutes",
        "tenants": ALL_TENANTS,
    })

    def run_all_tenants():
        for tid in ALL_TENANTS:
            run_pipeline(tenant_id=tid)

    # Run immediately on startup, then every 15 minutes
    run_all_tenants()

    schedule.every(15).minutes.do(run_all_tenants)

    while True:
        schedule.run_pending()
        time.sleep(30)


if __name__ == "__main__":
    main()
