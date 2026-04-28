"""
Google Maps / Places Enrichment Skill (MedSpa).

For med spa leads, Apollo B2B enrichment is less useful.
This skill uses Google Places API to enrich with:
  - Business hours, website, phone
  - Google review count + rating
  - Whether they have online booking (detected via website)
  - Website tech detection (template vs custom)

Requires GOOGLE_PLACES_API_KEY in env.
"""

import os
import re
import requests
import time
from typing import Any
from datetime import datetime, timezone

from db import get_db

GOOGLE_PLACES_API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "")
MEDSPA_TENANT_ID = "11111111-1111-1111-1111-111111111111"
RATE_LIMIT_DELAY = 0.5  # seconds between API calls


def _find_place(company_name: str, city: str, state: str) -> dict | None:
    """Find a business via Google Places Text Search."""
    query = f"{company_name} {city} {state} medspa"
    url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
    params = {
        "query": query,
        "key": GOOGLE_PLACES_API_KEY,
    }
    resp = requests.get(url, params=params, timeout=15)
    data = resp.json()
    results = data.get("results", [])
    return results[0] if results else None


def _get_place_details(place_id: str) -> dict | None:
    """Fetch full place details including website, reviews, hours."""
    url = "https://maps.googleapis.com/maps/api/place/details/json"
    params = {
        "place_id": place_id,
        "fields": "name,website,formatted_phone_number,rating,user_ratings_total,opening_hours,url,formatted_address,types",
        "key": GOOGLE_PLACES_API_KEY,
    }
    resp = requests.get(url, params=params, timeout=15)
    data = resp.json()
    return data.get("result")


def _detect_template_website(website: str | None) -> bool:
    """Simple heuristic: check if site is on known template platforms."""
    if not website:
        return False
    lower = website.lower()
    template_indicators = [
        "wix.com", "squarespace.com", "weebly.com", "godaddy.com",
        "wordpress.com", "sites.google.com", "mysite.com",
        ".wixsite.com", ".square.site", ".godaddysites.com",
    ]
    return any(ind in lower for ind in template_indicators)


def _detect_no_online_booking(website: str | None) -> bool:
    """
    Quick heuristic: if website is None or doesn't contain common booking
    platform patterns, assume no online booking.
    """
    if not website:
        return True
    lower = website.lower()
    # Common booking platforms in med spa world
    booking_patterns = [
        "booking", "schedule", "appointment", "calendly",
        "acuity", "mindbody", "vagaro", "fresha", "jane.app",
        "boulevard", "zenoti", "booker",
    ]
    # We can't actually crawl in this quick check, so we check the domain
    # Real detection happens in a separate step if needed
    return not any(p in lower for p in booking_patterns)


def process_gmaps_enrichment(
    tenant_id: str = MEDSPA_TENANT_ID,
    batch_size: int = 20,
) -> dict[str, Any]:
    """
    Find MedSpa leads needing enrichment and enrich via Google Places.
    Targets leads with status='new' that don't yet have a completed enrichment.
    """
    if not GOOGLE_PLACES_API_KEY:
        return {"error": "GOOGLE_PLACES_API_KEY not configured", "enriched": 0}

    db = get_db()
    now = datetime.now(timezone.utc).isoformat()

    # Find new leads for this tenant
    resp = db.table("leads")\
        .select("id, company_name, city, state, metadata")\
        .eq("tenant_id", tenant_id)\
        .eq("status", "new")\
        .limit(batch_size)\
        .execute()

    leads = resp.data or []
    enriched = 0
    errors = 0
    skipped = 0

    for lead in leads:
        # Skip if already has a Google enrichment
        existing = db.table("enrichments")\
            .select("id")\
            .eq("lead_id", lead["id"])\
            .eq("provider", "google_places")\
            .limit(1)\
            .execute()

        if existing.data:
            skipped += 1
            continue

        company = lead.get("company_name") or ""
        city = lead.get("city") or ""
        state = lead.get("state") or ""

        if not company:
            skipped += 1
            continue

        try:
            # Step 1: Find the place
            place = _find_place(company, city, state)
            if not place:
                # Record as failed enrichment
                db.table("enrichments").insert({
                    "lead_id": lead["id"],
                    "tenant_id": tenant_id,
                    "provider": "google_places",
                    "status": "failed",
                    "cost_cents": 0,
                    "requested_at": now,
                    "response_data": {"error": "Place not found"},
                }).execute()
                errors += 1
                continue

            # Step 2: Get details
            place_id = place.get("place_id")
            details = _get_place_details(place_id) if place_id else None

            website = (details or {}).get("website")
            phone = (details or {}).get("formatted_phone_number")
            rating = (details or {}).get("rating")
            review_count = (details or {}).get("user_ratings_total", 0)
            gmaps_url = (details or {}).get("url")

            # Step 3: Detect opportunity signals
            is_template = _detect_template_website(website)
            no_booking = _detect_no_online_booking(website)
            low_reviews = review_count is not None and review_count < 50

            # Step 4: Build enrichment metadata for scoring
            metadata = lead.get("metadata") or {}
            metadata.update({
                "google_rating": rating,
                "google_review_count": review_count,
                "google_maps_url": gmaps_url,
                "website": website,
            })

            # Step 5: Update score_breakdown with MedSpa opportunity signals
            score_signals = {
                "no_online_booking": no_booking,
                "template_website": is_template,
                "low_google_reviews": low_reviews,
                "google_rating": rating,
                "google_review_count": review_count,
            }

            # Compute an online_presence score from Google data
            online_score = 50  # base
            if website:
                online_score += 15
            if rating and rating >= 4.0:
                online_score += 15
            if review_count and review_count >= 50:
                online_score += 10
            if review_count and review_count >= 100:
                online_score += 10
            online_score = min(100, online_score)

            # Update lead
            update_data: dict[str, Any] = {
                "metadata": metadata,
                "score_breakdown": {**(lead.get("score_breakdown") or {}), **score_signals, "online_presence": online_score},
                "status": "enriching",
                "enriched_at": now,
                "updated_at": now,
            }
            if phone and not lead.get("phone"):
                update_data["phone"] = phone

            db.table("leads").update(update_data)\
                .eq("id", lead["id"])\
                .eq("tenant_id", tenant_id)\
                .execute()

            # Record successful enrichment
            db.table("enrichments").insert({
                "lead_id": lead["id"],
                "tenant_id": tenant_id,
                "provider": "google_places",
                "status": "completed",
                "cost_cents": 2,  # ~$0.02 per Places detail call
                "requested_at": now,
                "response_data": details or place,
            }).execute()

            enriched += 1

        except Exception as e:
            print(f"  ! GMaps enrichment error for {company}: {e}")
            errors += 1

        time.sleep(RATE_LIMIT_DELAY)

    summary = {
        "leads_found": len(leads),
        "enriched": enriched,
        "skipped": skipped,
        "errors": errors,
    }
    print(f"Google Maps enrichment complete: {summary}")
    return summary


if __name__ == "__main__":
    process_gmaps_enrichment()
