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

# Templates: same V3 DM copy from exotiq-dashboard
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
