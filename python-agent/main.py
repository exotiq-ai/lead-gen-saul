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

Invocation modes:
  python main.py           # default: run one cycle and exit (for cron)
  python main.py --once    # explicit one-shot
  python main.py --loop    # legacy in-process 15-min schedule for local dev

Discovery cadence is governed by the DB (last successful sourcing run
per tenant) rather than an in-process counter so cron invocations don't
re-run discovery on every tick.
"""

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone

import schedule

from db import get_db
from config import (
    APP_BASE_URL,
    DEFAULT_TENANT_ID,
    MEDSPA_TENANT_ID,
    SUPABASE_URL,
    check_required_config,
)
from skills.discover import discover_leads
from skills.draft import draft_outreach
from skills.enrich import process_enrichment_queue
from skills.enrich_gmaps import process_gmaps_enrichment
from skills.ghl_poll import poll_ghl
from skills.insights import generate_insights
from skills.score import process_scoring_queue

logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    stream=sys.stdout,
)

ALL_TENANTS = [DEFAULT_TENANT_ID, MEDSPA_TENANT_ID]


def _log(event: str, data: dict | None = None):
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": event,
        **(data or {}),
    }
    print(json.dumps(entry))


def log_agent_run(tenant_id: str, agent_type: str, status: str, data: dict, duration_ms: int):
    """Write an agent_runs record to Supabase for the dashboard.

    Extracts cost_cents and tokens_used from the skill summary when
    present so /dashboard/economics shows real numbers."""
    try:
        cost_cents = int(data.get("cost_cents") or 0) if isinstance(data, dict) else 0
        tokens_used = int(data.get("tokens_used") or 0) if isinstance(data, dict) else 0
        leads_processed = int(data.get("leads_processed") or 0) if isinstance(data, dict) else 0

        db = get_db()
        db.table("agent_runs").insert({
            "tenant_id": tenant_id,
            "agent_type": agent_type,
            "status": status,
            "output_data": data,
            "duration_ms": duration_ms,
            "cost_cents": cost_cents,
            "tokens_used": tokens_used,
            "leads_processed": leads_processed,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        _log("agent_run_log_error", {"error": str(e)})


def _run_step(tenant_id: str, step_name: str, agent_type: str, fn):
    """Run one pipeline step with uniform logging + agent_runs persistence."""
    _log("step_start", {"step": step_name, "tenant_id": tenant_id})
    t = time.time()
    try:
        result = fn()
        log_agent_run(tenant_id, agent_type, "completed", result or {}, int((time.time() - t) * 1000))
        _log("step_complete", {"step": step_name, **(result or {})})
    except Exception as e:
        err = {"error": str(e)}
        log_agent_run(tenant_id, agent_type, "failed", err, int((time.time() - t) * 1000))
        _log("step_error", {"step": step_name, **err})


def run_pipeline(tenant_id: str = DEFAULT_TENANT_ID):
    """
    Execute the full pipeline cycle for a single tenant.

    Discovery cadence is gated inside discover.py via the DB, so we
    always call every step. The skill decides whether to actually do
    work or skip on cooldown.
    """
    cycle_start = time.time()
    _log("pipeline_start", {"tenant_id": tenant_id})

    _run_step(tenant_id, "discover", "sourcing", lambda: discover_leads(tenant_id=tenant_id))

    if tenant_id == MEDSPA_TENANT_ID:
        _run_step(tenant_id, "enrich", "enrichment", lambda: process_gmaps_enrichment(tenant_id=tenant_id))
    else:
        _run_step(tenant_id, "enrich", "enrichment", lambda: process_enrichment_queue(tenant_id=tenant_id))

    _run_step(tenant_id, "score", "scoring", lambda: process_scoring_queue(tenant_id=tenant_id))
    _run_step(tenant_id, "ghl_poll", "ghl_poll", lambda: poll_ghl(tenant_id=tenant_id))
    _run_step(tenant_id, "draft", "outreach", lambda: draft_outreach(tenant_id=tenant_id))
    _run_step(tenant_id, "insights", "insights", lambda: generate_insights(tenant_id=tenant_id))

    total_ms = int((time.time() - cycle_start) * 1000)
    _log("pipeline_complete", {"tenant_id": tenant_id, "duration_ms": total_ms})


def run_all_tenants():
    for tid in ALL_TENANTS:
        try:
            run_pipeline(tenant_id=tid)
        except Exception as e:
            _log("pipeline_tenant_error", {"tenant_id": tid, "error": str(e)})


def _startup_health_check(strict: bool) -> bool:
    """Validate env and reachability before doing work.

    Returns True if healthy, False otherwise. In ``strict`` mode (cron / prod)
    we abort on failure; in non-strict mode (local --loop) we warn and continue.
    """
    missing = check_required_config(strict=strict)
    if missing:
        _log("startup_health_fail", {"missing_or_invalid": missing})
        return False

    # Supabase reachability — cheap count query.
    try:
        db = get_db()
        db.table("tenants").select("id", count="exact", head=True).limit(1).execute()
    except Exception as e:
        _log("startup_health_fail", {"check": "supabase", "error": str(e)})
        return False

    # Next.js reachability — APP_BASE_URL must answer. We use the dashboard
    # kpis endpoint as a cheap GET. Don't fail the whole startup on a
    # transient 5xx; only on hard connection failures.
    try:
        import requests
        r = requests.get(f"{APP_BASE_URL}/api/dashboard/kpis?tenant_id={DEFAULT_TENANT_ID}", timeout=10)
        if r.status_code >= 500:
            _log("startup_health_warn", {"check": "nextjs", "status": r.status_code})
    except Exception as e:
        _log("startup_health_warn", {"check": "nextjs", "error": str(e)})
        # Soft-warn rather than abort: enrich/score will surface failures
        # explicitly via agent_runs.

    _log("startup_health_ok", {"app_base_url": APP_BASE_URL})
    return True


def main():
    parser = argparse.ArgumentParser(description="Saul agent orchestrator")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true", help="Run one cycle for all tenants and exit (default)")
    mode.add_argument("--loop", action="store_true", help="Legacy: run an in-process 15-minute schedule (local dev)")
    args = parser.parse_args()

    use_loop = args.loop and not args.once

    _log("agent_service_start", {
        "supabase_url": SUPABASE_URL,
        "app_base_url": APP_BASE_URL,
        "mode": "loop" if use_loop else "once",
        "tenants": ALL_TENANTS,
    })

    healthy = _startup_health_check(strict=not use_loop)
    if not healthy and not use_loop:
        _log("agent_service_abort", {"reason": "startup_health_failed"})
        sys.exit(1)

    if use_loop:
        run_all_tenants()
        schedule.every(15).minutes.do(run_all_tenants)
        while True:
            schedule.run_pending()
            time.sleep(30)
    else:
        run_all_tenants()
        _log("agent_service_exit", {"mode": "once"})


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Saul Agent Pipeline")
    parser.add_argument("--once", action="store_true", help="Run one cycle and exit (for cron/Railway)")
    args = parser.parse_args()

    if args.once:
        for tid in ALL_TENANTS:
            run_pipeline(tenant_id=tid)
    else:
        main()
