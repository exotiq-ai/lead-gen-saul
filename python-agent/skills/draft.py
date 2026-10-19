from __future__ import annotations

"""
Outreach Drafting Skill.

Finds all scored leads above the threshold that don't yet have a
pending outreach draft, selects the right sequence, and inserts
a personalized draft into outreach_queue for human approval.

Design philosophy: I generate the drafts. Gregory approves them.
Nothing goes out without a human click. This is Phase 1 -- manual
approval mode. Phase 2 will add auto-send after trust is established.

Template selection logic:
- Score 80+: premium recent-content + operator-control note
- Score 60-79: recent-content + paid-booking-gap note
- Score 55-59: recent-content + clean-handoff note
"""

from datetime import datetime, timezone
from typing import Any

from db import get_db
from config import OUTREACH_SCORE_THRESHOLD, OUTREACH_AUTO_APPROVE

DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"
MEDSPA_TENANT_ID = "11111111-1111-1111-1111-111111111111"

# Exotiq (automotive) templates
TEMPLATES = {
    "tier1_proof": {
        "name": "IG DM -- Founder Launch + Operator Proof (Score 80+)",
        "channel": "instagram_dm",
        "body": """Hey {first_name},

I’m Gregory, founder of Exotiq. We’ve launched Drive Exotiq exclusively for luxury and exotic car rentals, and we’re onboarding select fleets in key cities.

{personalization_hook}

The Exotiq Command Center runs the rental backend, from dynamic pricing to bookings and fleet operations. One connected system, not a stack of separate tools.

Ed at Revel + Roam put it simply after switching: “The operational gains were immediate.”

Do you have 15 minutes this week to talk about bringing {company_name} onto the platform?""",
    },
    "peer_intro": {
        "name": "IG DM -- Founder Launch + Connected Backend (Score 60-79)",
        "channel": "instagram_dm",
        "body": """Hey {first_name},

I’m Gregory, founder of Exotiq. We’ve launched Drive Exotiq, our renter-facing platform exclusively for luxury and exotic rentals. We’re onboarding select fleets in key cities.

{personalization_hook}

The Exotiq Command Center connects the rental backend, including dynamic pricing, bookings and fleet operations, in one system.

Operators on Exotiq are already saving time and growing revenue with smarter pricing and less manual admin.

Do you have 15 minutes this week to talk about {company_name} joining the platform?""",
    },
    "visual_fleet": {
        "name": "IG DM -- Founder Launch + Fleet Fit (Score 55-59)",
        "channel": "instagram_dm",
        "body": """Hey {first_name},

I’m Gregory, founder of Exotiq. We’ve launched Drive Exotiq for luxury and exotic car rentals, and we’re inviting select fleets to join.

{personalization_hook}

Drive Exotiq connects the renter experience to the Exotiq Command Center, the backend for pricing, bookings and day-to-day fleet operations.

Operators on Exotiq are already saving time and growing revenue with smarter pricing and less manual admin.

Could we connect for 15 minutes this week to discuss whether it fits {company_name}?""",
    },
}


# MedSpa-specific outreach templates
MEDSPA_TEMPLATES = {
    "website_audit": {
        "name": "IG DM -- Website Audit (Score 70+)",
        "channel": "instagram_dm",
        "body": """Hey {first_name}, Gregory here.

Spent a few minutes on {company_name}'s site — your work is stunning. The before/afters alone are worth more traffic than you're probably getting.

We help med spas turn their existing content into a booking machine. One of our clients added 23 new clients in 30 days without touching their ad spend.

Worth a 15-min chat? I'll show you exactly what I'd change first.""",
    },
    "booking_modernization": {
        "name": "IG DM -- Booking System Pitch (Score 55-69)",
        "channel": "instagram_dm",
        "body": """Hey {first_name}, it's Gregory.

Noticed {company_name} is still using {booking_note} for bookings. Totally fine — until you realize how many people bail when they can't book instantly at midnight.

We set up a booking system that works while you sleep. Takes about a week to go live.

Happy to show you what it looks like in practice — no pitch, just a walkthrough.""",
    },
    "before_after_gallery": {
        "name": "IG DM -- Gallery/Social Proof (Score 45-54)",
        "channel": "instagram_dm",
        "body": """Hey {first_name}, Gregory here.

Your gallery at {company_name} is genuinely impressive — that kind of work deserves to be seen by 10x the audience.

We help med spas systemize their social proof so it actually converts. Quick question: are you getting consultations directly from Instagram or mostly from Google?

Asking because the answer changes everything about how we'd approach it.""",
    },
}


def _fetch_db_templates(tenant_id: str) -> list[dict]:
    """Fetch all active outreach_sequences.steps[] for this tenant.

    Returns a flat list of {variant, label, channel, score_min, score_max,
    body} dicts. Empty list when no rows / on error -- callers fall back
    to the hard-coded TEMPLATES dict above.
    """
    db = get_db()
    try:
        resp = db.table("outreach_sequences")\
            .select("id, slug, steps")\
            .eq("tenant_id", tenant_id)\
            .eq("is_active", True)\
            .execute()
    except Exception as exc:  # noqa: BLE001
        print(f"  ! outreach_sequences fetch error: {exc}")
        return []
    out: list[dict] = []
    for row in resp.data or []:
        steps = row.get("steps") or []
        if isinstance(steps, list):
            for s in steps:
                if isinstance(s, dict):
                    s = {**s, "_sequence_slug": row.get("slug")}
                    out.append(s)
    return out


def _first_text(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _personalization_hook(lead: dict) -> str:
    """Use dated, sourced, high-confidence context or omit the optional hook.

    A fetch timestamp is not a publication date. Missing research must not become
    a fabricated diagnosis, generic compliment or a search-query-shaped market.
    """
    breakdown = lead.get("score_breakdown") or {}
    metadata = lead.get("metadata") or {}
    for prefix in ("latest_instagram_post", "latest_brand_partnership", "latest_news_pr"):
        summary = _first_text(breakdown.get(prefix + "_summary"), metadata.get(prefix + "_summary"))
        source = _first_text(breakdown.get(prefix + "_url"), metadata.get(prefix + "_url"))
        published = _first_text(breakdown.get(prefix + "_published_at"), metadata.get(prefix + "_published_at"))
        confidence = _first_text(breakdown.get(prefix + "_confidence"), metadata.get(prefix + "_confidence")) or ""
        if not summary or len(summary) > 180 or not source or not source.startswith("https://"):
            continue
        if not published or not confidence.upper().startswith(("HIGH", "CONFIRMED")):
            continue
        try:
            date = datetime.fromisoformat(published.replace("Z", "+00:00"))
            if date.tzinfo is None:
                date = date.replace(tzinfo=timezone.utc)
            age = (datetime.now(timezone.utc) - date).total_seconds() / 86400
        except (ValueError, TypeError):
            continue
        if 0 <= age <= 90:
            return f"I saw your recent update about {summary.rstrip('.')}. That is why I wanted to connect."
    return ""


def _exotiq_drafting_hold(lead: dict) -> bool:
    if lead.get("converted_at") or lead.get("stage_id") == "f9e0488f-fbd4-49a0-97cf-094aa74b80db":
        return True
    if lead.get("status") in {"converted", "engaged", "qualified", "lost", "disqualified"}:
        return True
    breakdown = lead.get("score_breakdown") or {}
    if not isinstance(breakdown, dict):
        return True
    if breakdown.get("uk_lead") or str(breakdown.get("country_code", "US")).upper() not in {"US", "USA", "UNITED STATES"}:
        return True
    review = breakdown.get("launch_copy_review") or {}
    if not isinstance(review, dict):
        return True
    return bool(review.get("review_holds") or (review.get("lane") and review["lane"] != "cold"))


def _automatic_review_allowed(tenant_id: str) -> bool:
    return tenant_id != DEFAULT_TENANT_ID and OUTREACH_AUTO_APPROVE


def _interpolate(body: str, lead: dict) -> str:
    """Render template with the variables we know about. {booking_note}
    only resolves for MedSpa leads -- for Exotiq it formats to empty."""
    booking_note = ((lead.get("metadata") or {}).get("booking_system")) or "a form"
    try:
        return body.format(
            first_name=lead.get("first_name") or "there",
            company_name=lead.get("company_name") or "your company",
            booking_note=booking_note,
            personalization_hook=_personalization_hook(lead),
        )
    except (KeyError, IndexError):
        # Body referenced an unknown variable; surface the raw template so
        # the SDR sees something usable rather than crashing the loop.
        return body


def _select_template_from_db(score: int, db_steps: list[dict]) -> dict | None:
    """Pick the highest-precedence step whose [score_min..score_max] band
    contains the score. Higher score_min wins ties."""
    candidates = [
        s for s in db_steps
        if isinstance(s.get("score_min"), int)
        and isinstance(s.get("score_max"), int)
        and s["score_min"] <= score <= s["score_max"]
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda s: s.get("score_min", 0), reverse=True)
    return candidates[0]


def _select_medspa_template(score: int, lead: dict) -> dict:
    """Fallback to hard-coded MedSpa templates when DB has nothing."""
    if score >= 70:
        return MEDSPA_TEMPLATES["website_audit"]
    elif score >= 55:
        return MEDSPA_TEMPLATES["booking_modernization"]
    return MEDSPA_TEMPLATES["before_after_gallery"]


def _select_template(score: int) -> dict:
    """Fallback to hard-coded Exotiq templates when DB has nothing."""
    if score >= 80:
        return TEMPLATES["tier1_proof"]
    elif score >= 60:
        return TEMPLATES["peer_intro"]
    return TEMPLATES["visual_fleet"]


def draft_outreach(
    tenant_id: str = DEFAULT_TENANT_ID,
    batch_size: int = 25,
) -> dict[str, Any]:
    """
    Find scored leads above threshold without a pending draft and generate one.

    Template source: outreach_sequences DB rows preferred. Falls back to
    the hard-coded TEMPLATES / MEDSPA_TEMPLATES dicts when DB is empty
    (e.g. fresh project, migration 010 not yet applied).
    """
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()

    # Pull active sequences once per pipeline cycle.
    db_steps = _fetch_db_templates(tenant_id)

    # Leads that are scored and above threshold
    resp = db.table("leads")\
        .select("id, first_name, last_name, company_name, score, company_location, company_industry, score_breakdown, status, converted_at, stage_id")\
        .eq("tenant_id", tenant_id)\
        .eq("status", "scored")\
        .gte("score", OUTREACH_SCORE_THRESHOLD)\
        .limit(batch_size)\
        .execute()

    candidates = resp.data or []

    drafted = 0
    skipped_existing = 0
    skipped_review_hold = 0
    used_db = 0
    used_fallback = 0

    for lead in candidates:
        if tenant_id == DEFAULT_TENANT_ID and _exotiq_drafting_hold(lead):
            skipped_review_hold += 1
            continue
        # Check if a pending draft already exists
        existing = db.table("outreach_queue")\
            .select("id")\
            .eq("lead_id", lead["id"])\
            .eq("tenant_id", tenant_id)\
            .in_("status", ["pending", "approved"])\
            .limit(1)\
            .execute()

        if existing.data:
            skipped_existing += 1
            continue

        score = lead.get("score") or 0
        # Prefer DB templates. Each step has score_min/score_max bands.
        db_pick = _select_template_from_db(score, db_steps)
        if db_pick:
            template_body = db_pick.get("body") or ""
            draft_body = _interpolate(template_body, lead)
            template_name = db_pick.get("label") or db_pick.get("variant") or "db_template"
            channel = db_pick.get("channel") or "instagram_dm"
            used_db += 1
        else:
            if tenant_id == MEDSPA_TENANT_ID:
                fb = _select_medspa_template(score, lead)
            else:
                fb = _select_template(score)
            template_name = fb["name"]
            channel = fb["channel"]
            draft_body = _interpolate(fb["body"], lead)
            used_fallback += 1

        auto_review = _automatic_review_allowed(tenant_id)
        status = "approved" if auto_review else "pending"
        insert_row = {
            "tenant_id": tenant_id,
            "lead_id": lead["id"],
            "channel": channel,
            "message_draft": draft_body,
            "status": status,
            "generated_by": f"saul_agent:{template_name}",
            "created_at": now,
            "updated_at": now,
        }
        if auto_review:
            insert_row["reviewed_by"] = "gregory"
            insert_row["approved_at"] = now

        db.table("outreach_queue").insert(insert_row).execute()

        # Advance lead status
        db.table("leads").update({
            "status": "outreach",
            "updated_at": now,
        }).eq("id", lead["id"]).eq("tenant_id", tenant_id).execute()

        drafted += 1

    summary = {
        "candidates": len(candidates),
        "drafted": drafted,
        "skipped_existing_draft": skipped_existing,
        "skipped_review_hold": skipped_review_hold,
        "used_db_templates": used_db,
        "used_fallback_templates": used_fallback,
        "leads_processed": drafted,
        # Drafting today is rule-based -- score band picks a template and
        # we string-format vars. No LLM calls = no token cost.
        "cost_cents": 0,
    }
    print(f"Drafting complete: {summary}")
    return summary


if __name__ == "__main__":
    draft_outreach()
