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


def _select_medspa_template(score: int, lead: dict) -> dict:
    """Pick MedSpa template and interpolate lead-specific vars."""
    if score >= 70:
        tmpl = MEDSPA_TEMPLATES["website_audit"]
    elif score >= 55:
        tmpl = MEDSPA_TEMPLATES["booking_modernization"]
    else:
        tmpl = MEDSPA_TEMPLATES["before_after_gallery"]

    # Extra interpolation var for booking template
    booking_note = lead.get("metadata", {}).get("booking_system") or "a form"
    body = tmpl["body"].format(
        first_name=lead.get("first_name") or "there",
        company_name=lead.get("company_name") or "your spa",
        booking_note=booking_note,
    )
    return {**tmpl, "body": body}


def _select_template(score: int) -> dict:
    if score >= 80:
        return TEMPLATES["tier1_proof"]
    elif score >= 60:
        return TEMPLATES["peer_intro"]
    else:
        return TEMPLATES["visual_fleet"]


def _render(template_body: str, first_name: str, company_name: str) -> str:
    return template_body.format(
        first_name=first_name or "there",
        company_name=company_name or "your company",
    )


def draft_outreach(
    tenant_id: str = DEFAULT_TENANT_ID,
    batch_size: int = 25,
) -> dict[str, Any]:
    """
    Find scored leads above threshold without a pending draft and generate one.
    """
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()

    # Leads that are scored and above threshold
    resp = db.table("leads")\
        .select("id, first_name, last_name, company_name, score")\
        .eq("tenant_id", tenant_id)\
        .eq("status", "scored")\
        .gte("score", OUTREACH_SCORE_THRESHOLD)\
        .limit(batch_size)\
        .execute()

    candidates = resp.data or []

    drafted = 0
    skipped_existing = 0

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
        if tenant_id == MEDSPA_TENANT_ID:
            template = _select_medspa_template(score, lead)
            draft_body = template["body"]  # already interpolated
        else:
            template = _select_template(score)
            first_name = lead.get("first_name") or ""
            company_name = lead.get("company_name") or ""
            draft_body = _render(template["body"], first_name, company_name)

        db.table("outreach_queue").insert({
            "tenant_id": tenant_id,
            "lead_id": lead["id"],
            "channel": template["channel"],
            "message_draft": draft_body,
            "status": "pending",
            "generated_by": f"saul_agent:{template['name']}",
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
    }
    print(f"Drafting complete: {summary}")
    return summary


if __name__ == "__main__":
    draft_outreach()
