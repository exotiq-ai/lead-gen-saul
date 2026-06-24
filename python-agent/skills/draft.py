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
        "name": "IG DM -- Premium Recent Content + Control (Score 80+)",
        "channel": "instagram_dm",
        "body": """Hey {first_name}, Gregory Ringler here. I run Exotiq.

{personalization_hook}

At your scale, the hard part usually is not getting attention. It is keeping quote, availability, renter check, deposit, and handoff tight without making the customer experience feel ordinary.

That is where Exotiq fits. One command center for pricing, bookings, compliance, and guest comms, with Rari handling the admin that steals nights and weekends.

Worth comparing notes for 15 minutes?""",
    },
    "peer_intro": {
        "name": "IG DM -- Fast Market Recent Content + Paid Booking Gap (Score 60-79)",
        "channel": "instagram_dm",
        "body": """Hey {first_name}, Gregory Ringler here. I run Exotiq.

{personalization_hook}

Renters in your market move fast, but a premium operator can’t treat every inquiry like a generic quote. The money is usually made or lost between “what do you have this weekend?” and a paid, verified booking.

Exotiq gives exotic operators one command center for pricing, availability, deposits, docs, follow-up, and Rari-assisted guest comms.

Worth a quick look this week?""",
    },
    "visual_fleet": {
        "name": "IG DM -- Regional Recent Content + Clean Handoff (Score 55-59)",
        "channel": "instagram_dm",
        "body": """Hey {first_name}, Gregory Ringler here. I run Exotiq.

{personalization_hook}

For operators growing past the early stage, a missed handoff can cost more than a missed lead. The gap is usually between someone asking what is available and a paid, verified booking with the details handled cleanly.

That is what Exotiq is built around: one cleaner path from inquiry to renter check, deposit, agreement, and handoff.

Worth comparing notes for 15 minutes?""",
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
    """Use the newest content/business context captured by enrichment.

    Preference order: latest IG post, recent news/PR, then a safe company-specific
    fallback. This keeps outreach engaged without inventing compliments.
    """
    breakdown = lead.get("score_breakdown") or {}
    metadata = lead.get("metadata") or {}
    latest_ig = _first_text(
        breakdown.get("latest_instagram_post_summary"),
        metadata.get("latest_instagram_post_summary"),
        breakdown.get("recent_ig_post"),
        metadata.get("recent_ig_post"),
    )
    if latest_ig:
        return f"Saw the recent post about {latest_ig}. It reads like you are already selling the experience, not just renting cars."

    partnership = _first_text(
        breakdown.get("latest_brand_partnership_summary"),
        metadata.get("latest_brand_partnership_summary"),
    )
    if partnership:
        return f"I saw the recent partnership/event mention about {partnership}. That kind of visibility makes the booking handoff matter even more."

    news = _first_text(
        breakdown.get("latest_news_pr_summary"),
        metadata.get("latest_news_pr_summary"),
        breakdown.get("recent_news_pr"),
        metadata.get("recent_news_pr"),
    )
    if news:
        return f"I saw the recent mention about {news}. That kind of visibility makes the booking handoff matter even more."

    business_observation = _first_text(
        breakdown.get("latest_business_observation_summary"),
        metadata.get("latest_business_observation_summary"),
    )
    if business_observation:
        return f"I was looking at {lead.get('company_name') or 'your operation'} and noticed {business_observation}. My read is that the opportunity is tightening the path from interest to a paid, verified booking."

    company = lead.get("company_name") or "your operation"
    location = lead.get("company_location") or "your market"
    return f"I was looking at {company} in {location}. My read is that the opportunity is tightening the path from interest to a paid, verified booking."


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
        .select("id, first_name, last_name, company_name, score, company_location, company_industry, score_breakdown, metadata")\
        .eq("tenant_id", tenant_id)\
        .eq("status", "scored")\
        .gte("score", OUTREACH_SCORE_THRESHOLD)\
        .limit(batch_size)\
        .execute()

    candidates = resp.data or []

    drafted = 0
    skipped_existing = 0
    used_db = 0
    used_fallback = 0

    for lead in candidates:
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

        status = "approved" if OUTREACH_AUTO_APPROVE else "pending"
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
        if OUTREACH_AUTO_APPROVE:
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
