"""
Lead Discovery Skill.

Searches the web for exotic car rental operators in target markets,
filters out major corporations, and inserts new leads into Supabase.
Deduplicates against existing leads by company name.

Cadence: under cron-style invocation the orchestrator can't rely on an
in-process counter, so we check ``agent_runs`` for the last successful
sourcing run per tenant. Discovery is skipped when the last successful
run is younger than DISCOVERY_MIN_INTERVAL_SECONDS.

Multi-tenant: this skill only knows how to discover exotic-car-rental
operators. The MedSpa tenant has a different ICP, so discovery is
short-circuited for that tenant until a dedicated discover_gmaps.py
is built.
"""

import re
import time
from datetime import datetime, timezone, timedelta
from typing import Any

from db import get_db
from config import (
    DISCOVERY_MAX_PER_RUN,
    DISCOVERY_MIN_INTERVAL_SECONDS,
    MEDSPA_TENANT_ID,
    RATE_LIMIT_DELAY,
)

EXCLUSION_LIST = {"hertz", "enterprise", "avis", "budget", "sixt", "thrifty", "dollar", "turo"}
DOMAIN_RE = re.compile(r"https?://(?:www\.)?([^/]+)")

# Markets to discover in, ordered by priority
TARGET_MARKETS = [
    "Miami", "Los Angeles", "Las Vegas", "New York", "Scottsdale",
    "San Diego", "Houston", "Atlanta", "Dallas", "Chicago",
    "Phoenix", "Austin", "San Francisco", "Seattle", "Denver",
    "Tampa", "Orlando", "Philadelphia", "San Antonio", "Fort Worth",
    "Nashville", "Charlotte", "Boston", "Washington DC", "Portland",
]

QUERY_TEMPLATES = [
    "exotic car rental {city}",
    "luxury car rental {city}",
    "lamborghini rental {city}",
    "supercar rental {city}",
]

DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"


def _get_existing_companies(tenant_id: str) -> set:
    """Return lowercase company names already in the database."""
    db = get_db()
    resp = db.table("leads").select("company_name").eq("tenant_id", tenant_id).execute()
    return {r["company_name"].lower() for r in (resp.data or []) if r.get("company_name")}


def _search_web(query: str) -> list:
    """
    Placeholder for web search. In production, Saul calls this via
    his web_search tool. For standalone execution, uses DuckDuckGo.
    """
    try:
        import requests
        resp = requests.get(
            "https://html.duckduckgo.com/html/",
            params={"q": query},
            headers={"User-Agent": "SaulAgent/1.0"},
            timeout=10,
        )
        # Very basic extraction from DuckDuckGo HTML
        results = []
        for match in re.finditer(r'<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>([^<]+)</a>', resp.text):
            url, title = match.groups()
            results.append({"url": url, "title": title.strip()})
        return results[:10]
    except Exception as e:
        print(f"  ! Web search error: {e}")
        return []


def _last_discovery_age_seconds(tenant_id: str) -> float:
    """Return seconds since the last successful sourcing run for this tenant.

    Returns a large number (effectively +inf) if no prior successful run
    exists, so the caller treats it as 'overdue'."""
    try:
        db = get_db()
        resp = db.table("agent_runs")\
            .select("completed_at")\
            .eq("tenant_id", tenant_id)\
            .eq("agent_type", "sourcing")\
            .eq("status", "completed")\
            .order("completed_at", desc=True)\
            .limit(1)\
            .execute()
        rows = resp.data or []
        if not rows or not rows[0].get("completed_at"):
            return float("inf")
        last = datetime.fromisoformat(rows[0]["completed_at"].replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - last).total_seconds()
    except Exception as e:
        print(f"  ! discovery cadence check failed: {e}")
        return float("inf")  # fail open — better to run than silently skip


def discover_leads(
    tenant_id: str = DEFAULT_TENANT_ID,
    markets: list = None,
    max_leads: int = DISCOVERY_MAX_PER_RUN,
    force: bool = False,
) -> dict[str, Any]:
    """
    Discover new leads in target markets and insert them into the database.

    Returns a summary dict with counts.
    """
    # MedSpa uses a different ICP; this skill's queries don't apply.
    if tenant_id == MEDSPA_TENANT_ID:
        summary = {
            "skipped": True,
            "reason": "medspa_tenant_uses_csv_import_until_discover_gmaps_exists",
            "discovered": 0,
            "leads_processed": 0,
            "cost_cents": 0,
        }
        print(f"Discovery skipped (MedSpa tenant): {summary}")
        return summary

    # DB-based cadence gate: avoid hammering search APIs on every cron tick.
    if not force:
        age = _last_discovery_age_seconds(tenant_id)
        if age < DISCOVERY_MIN_INTERVAL_SECONDS:
            summary = {
                "skipped": True,
                "reason": f"last_run_{int(age)}s_ago_min_{DISCOVERY_MIN_INTERVAL_SECONDS}s",
                "discovered": 0,
                "leads_processed": 0,
                "cost_cents": 0,
            }
            print(f"Discovery skipped (cadence): {summary}")
            return summary

    db = get_db()
    existing = _get_existing_companies(tenant_id)
    target_markets = markets or TARGET_MARKETS
    now = datetime.now(timezone.utc).isoformat()

    discovered = 0
    skipped_duplicates = 0
    skipped_corporate = 0
    seen_domains: set[str] = set()

    for market in target_markets:
        if discovered >= max_leads:
            break

        for template in QUERY_TEMPLATES:
            if discovered >= max_leads:
                break

            query = template.format(city=market)
            results = _search_web(query)

            for result in results:
                if discovered >= max_leads:
                    break

                title = result.get("title", "")
                url = result.get("url", "")

                # Filter corporations
                if any(exc in title.lower() or exc in url.lower() for exc in EXCLUSION_LIST):
                    skipped_corporate += 1
                    continue

                # Deduplicate by domain
                domain_match = DOMAIN_RE.search(url)
                if not domain_match:
                    continue
                domain = domain_match.group(1)
                if domain in seen_domains:
                    continue
                seen_domains.add(domain)

                # Clean company name
                company = re.sub(r"\|.*$", "", title).strip()
                company = re.sub(r"-.*$", "", company).strip()
                if not company or len(company) < 3:
                    continue

                # Deduplicate against existing DB
                if company.lower() in existing:
                    skipped_duplicates += 1
                    continue

                # Insert
                db.table("leads").insert({
                    "tenant_id": tenant_id,
                    "company_name": company,
                    "company_domain": domain,
                    "company_location": market,
                    "source": "outbound",
                    "source_detail": f"saul_discovery_{market.lower().replace(' ', '_')}",
                    "status": "new",
                    "created_at": now,
                    "updated_at": now,
                }).execute()

                existing.add(company.lower())
                discovered += 1

            time.sleep(RATE_LIMIT_DELAY)

    summary = {
        "discovered": discovered,
        "skipped_duplicates": skipped_duplicates,
        "skipped_corporate": skipped_corporate,
        "markets_searched": len(target_markets),
        "leads_processed": discovered,
        # DuckDuckGo HTML scraping is free; cost stays at 0 unless we
        # ever swap to a paid SERP API (see python-agent/costs.py).
        "cost_cents": 0,
    }
    print(f"Discovery complete: {summary}")
    return summary


if __name__ == "__main__":
    discover_leads()
