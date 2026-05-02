"""
Lead Discovery Skill.

Searches the web for exotic car rental operators in target markets,
filters out major corporations, and inserts new leads into Supabase.
Deduplicates against existing leads by company name.
"""

import re
import time
from datetime import datetime, timezone
from typing import Any

from db import get_db
from config import DISCOVERY_MAX_PER_RUN, RATE_LIMIT_DELAY

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


def discover_leads(
    tenant_id: str = DEFAULT_TENANT_ID,
    markets: list = None,
    max_leads: int = DISCOVERY_MAX_PER_RUN,
) -> dict[str, Any]:
    """
    Discover new leads in target markets and insert them into the database.

    Returns a summary dict with counts.
    """
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
    }
    print(f"Discovery complete: {summary}")
    return summary


if __name__ == "__main__":
    discover_leads()
