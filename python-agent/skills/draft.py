"""
Outreach Drafting Skill.

Finds all scored leads above the threshold that don't yet have a
pending outreach draft, selects the right sequence, and inserts
a personalized draft into outreach_queue for human approval.

Design philosophy: I generate the drafts. Gregory approves them.
Nothing goes out without a human click. This is Phase 1 -- manual
approval mode. Phase 2 will add auto-send after trust is established.

Template selection logic:
- Score 80+: Tier 1 proof (Jay Denver case study)
- Score 60-79: Peer intro (founder-to-founder)
- Score 55-59: Visual/fleet angle
"""

from datetime import datetime, timezone
from typing import Any

from db import get_db
from config import OUTREACH_SCORE_THRESHOLD

DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"
MEDSPA_TENANT_ID = "11111111-1111-1111-1111-111111111111"

# Exotiq (automotive) templates
TEMPLATES = {
    "tier1_proof": {
        "name": "IG DM -- Jay Denver Proof (Score 80+)",
        "channel": "instagram_dm",
        "body": """Hey {first_name}, Gregory here from Exotiq.

Jay at Denver Exotic Rentals just replaced his entire ops stack with our Command Center. His words: "after 10 years in the exotic rental business, we finally have a system that gets what we need."

{company_name} is clearly running at a level where this fits. Worth a 15-minute look?""",
    },
    "peer_intro": {
        "name": "IG DM -- Peer Intro (Score 60-79)",
        "channel": "instagram_dm",
        "body": """Hey {first_name}, Gregory here. I run Exotiq. Started in exotics before building the tech.

Curious how you're handling pricing and fleet logistics at {company_name}. That's where most operators tell us they're leaving money on the table.

Connecting with operators this month. Happy to share what we're learning from the ones already on the platform. No sales pitch.""",
    },
    "visual_fleet": {
        "name": "IG DM -- Visual/Fleet (Score 55-59)",
        "channel": "instagram_dm",
        "body": """Hey {first_name}, it's Gregory at Exotiq.

Your fleet at {company_name} is unreal. You clearly know your market.

I'm connecting with exotic car operators this month and helping optimize fleets. With you running at this scale, I'd love your take. Could we grab 15 minutes?""",
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


def _interpolate(body: str, lead: dict) -> str:
    """Render template with the variables we know about. {booking_note}
    only resolves for MedSpa leads -- for Exotiq it formats to empty."""
    booking_note = ((lead.get("metadata") or {}).get("booking_system")) or "a form"
    try:
        return body.format(
            first_name=lead.get("first_name") or "there",
            company_name=lead.get("company_name") or "your company",
            booking_note=booking_note,
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
        .select("id, first_name, last_name, company_name, score, metadata")\
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

        db.table("outreach_queue").insert({
            "tenant_id": tenant_id,
            "lead_id": lead["id"],
            "channel": channel,
            "message_draft": draft_body,
            "status": "pending",
            "generated_by": f"saul_agent:{template_name}",
            "created_at": now,
            "updated_at": now,
        }).execute()

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
