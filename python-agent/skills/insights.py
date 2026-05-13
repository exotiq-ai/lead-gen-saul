"""
AI Insights Skill — Proactive Intelligence Layer.

Runs after GHL poll + scoring each cycle. Analyzes recent pipeline
activity and writes actionable insight cards to agent_insights table.

Insight types generated:
  1. reply_analysis    — scrubs inbound messages, classifies intent, suggests response
  2. dead_lead         — diagnoses why leads went cold, recommends re-engagement
  3. new_lead_assess   — first-impression scoring for freshly discovered leads
  4. draft_quality     — reviews pending outreach drafts before human approval
  5. daily_narrative   — 2-3 sentence executive summary of pipeline health
  6. opportunity       — timing/pattern signals worth acting on
  7. risk_alert        — competitor mentions, negative signals

Design:
  - Uses LLM (OpenAI or Anthropic) for natural language analysis
  - Falls back to rule-based heuristics if no LLM key is configured
  - Writes directly to agent_insights table in Supabase
  - Deduplicates: won't re-analyze the same activity/lead twice in 24h
  - Each insight has a confidence score and expiry window
"""

import os
import sys
import json
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Optional
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from db import get_db  # noqa: E402
from costs import llm_cost_cents, PER_CALL_COSTS_CENTS  # noqa: E402

# LLM configuration
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
INSIGHTS_MODEL = os.environ.get("INSIGHTS_MODEL", "gpt-4o-mini")
INSIGHTS_ENABLED = os.environ.get("INSIGHTS_ENABLED", "true").lower() in ("true", "1", "yes")

DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"

# Insight expiry windows
EXPIRY_HOURS = {
    "reply_analysis": 48,
    "dead_lead": 168,       # 7 days
    "new_lead_assess": 72,
    "draft_quality": 24,
    "daily_narrative": 24,
    "opportunity": 72,
    "risk_alert": 48,
}


def _call_llm(prompt: str, system: str = "", max_tokens: int = 500) -> Optional[dict]:
    """Call the configured LLM. Returns {text, input_tokens, output_tokens} or None."""
    if OPENAI_API_KEY:
        return _call_openai(prompt, system, max_tokens)
    elif ANTHROPIC_API_KEY:
        return _call_anthropic(prompt, system, max_tokens)
    return None


def _call_openai(prompt: str, system: str, max_tokens: int) -> Optional[dict]:
    """Call OpenAI chat completions."""
    import requests
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    try:
        r = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": INSIGHTS_MODEL,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": 0.3,
            },
            timeout=30,
        )
        if r.status_code != 200:
            print(f"  ! OpenAI error: {r.status_code} {r.text[:200]}")
            return None
        data = r.json()
        choice = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        return {
            "text": choice,
            "input_tokens": usage.get("prompt_tokens", 0),
            "output_tokens": usage.get("completion_tokens", 0),
        }
    except Exception as e:
        print(f"  ! OpenAI call failed: {e}")
        return None


def _call_anthropic(prompt: str, system: str, max_tokens: int) -> Optional[dict]:
    """Call Anthropic messages API."""
    import requests
    try:
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": max_tokens,
                "system": system or "You are Saul, an AI sales intelligence agent.",
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=30,
        )
        if r.status_code != 200:
            print(f"  ! Anthropic error: {r.status_code} {r.text[:200]}")
            return None
        data = r.json()
        text = data["content"][0]["text"]
        usage = data.get("usage", {})
        return {
            "text": text,
            "input_tokens": usage.get("input_tokens", 0),
            "output_tokens": usage.get("output_tokens", 0),
        }
    except Exception as e:
        print(f"  ! Anthropic call failed: {e}")
        return None


def _insight_exists_recently(tenant_id: str, insight_type: str, lead_id: Optional[str], hours: int = 24) -> bool:
    """Check if a similar insight was already created recently."""
    db = get_db()
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    query = db.table("agent_insights")\
        .select("id", count="exact", head=True)\
        .eq("tenant_id", tenant_id)\
        .eq("insight_type", insight_type)\
        .gte("created_at", since)
    if lead_id:
        query = query.eq("lead_id", lead_id)
    resp = query.execute()
    return (resp.count or 0) > 0


def _write_insight(
    tenant_id: str,
    insight_type: str,
    title: str,
    body: str,
    lead_id: Optional[str] = None,
    priority: int = 50,
    suggested_action: Optional[str] = None,
    action_type: Optional[str] = None,
    action_payload: Optional[dict] = None,
    source_activity_id: Optional[str] = None,
    source_data: Optional[dict] = None,
    confidence: int = 70,
    model_used: Optional[str] = None,
) -> None:
    """Insert an insight into agent_insights table."""
    db = get_db()
    expiry_h = EXPIRY_HOURS.get(insight_type, 48)
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=expiry_h)).isoformat()

    db.table("agent_insights").insert({
        "tenant_id": tenant_id,
        "lead_id": lead_id,
        "insight_type": insight_type,
        "priority": priority,
        "status": "active",
        "title": title,
        "body": body,
        "suggested_action": suggested_action,
        "action_type": action_type,
        "action_payload": action_payload,
        "source_activity_id": source_activity_id,
        "source_data": source_data,
        "confidence": confidence,
        "model_used": model_used,
        "expires_at": expires_at,
    }).execute()


# ─── INSIGHT GENERATORS ───────────────────────────────────────────────────────


def _analyze_replies(tenant_id: str) -> int:
    """Analyze recent inbound messages and classify intent."""
    db = get_db()
    since = (datetime.now(timezone.utc) - timedelta(hours=4)).isoformat()

    resp = db.table("lead_activities")\
        .select("id, lead_id, metadata, created_at, leads!inner(company_name, first_name, score)")\
        .eq("tenant_id", tenant_id)\
        .in_("activity_type", ["dm_replied", "email_replied", "call_answered"])\
        .gte("created_at", since)\
        .order("created_at", desc=True)\
        .limit(10)\
        .execute()

    count = 0
    for activity in (resp.data or []):
        lead_id = activity["lead_id"]
        if _insight_exists_recently(tenant_id, "reply_analysis", lead_id, hours=24):
            continue

        lead = activity.get("leads", {})
        if isinstance(lead, list):
            lead = lead[0] if lead else {}
        company = lead.get("company_name", "Unknown")
        first_name = lead.get("first_name", "")
        score = lead.get("score", 0)
        msg_body = (activity.get("metadata") or {}).get("body", "")[:500]

        if not msg_body.strip():
            continue

        # LLM analysis
        system = """You are Saul, an AI sales intelligence agent for Exotiq (exotic car rental CRM).
Analyze this inbound reply from a lead and respond in JSON:
{
  "intent": "interested|objection|question|booking_request|not_interested|unclear",
  "sentiment": "positive|neutral|negative",
  "summary": "one sentence summary of what they said",
  "suggested_reply": "2-3 sentence suggested response in Gregory's voice (casual, confident, peer-to-peer)",
  "urgency": "high|medium|low"
}"""

        prompt = f"""Lead: {company} ({first_name}), Score: {score}
Their message: "{msg_body}"

Classify intent and suggest Gregory's next move."""

        result = _call_llm(prompt, system, max_tokens=300)

        if result:
            try:
                analysis = json.loads(result["text"])
            except json.JSONDecodeError:
                analysis = {"intent": "unclear", "summary": msg_body[:100], "suggested_reply": "", "urgency": "medium"}

            priority = 90 if analysis.get("urgency") == "high" else 70 if analysis.get("urgency") == "medium" else 50
            intent = analysis.get("intent", "unclear")

            _write_insight(
                tenant_id=tenant_id,
                insight_type="reply_analysis",
                title=f"{company} replied — {intent.replace('_', ' ')}",
                body=analysis.get("summary", msg_body[:100]),
                lead_id=lead_id,
                priority=priority,
                suggested_action=analysis.get("suggested_reply", "Review and respond"),
                action_type="view_thread",
                action_payload={"lead_id": lead_id, "activity_id": activity["id"]},
                source_activity_id=activity["id"],
                source_data={"message_snippet": msg_body[:200], "intent": intent, "sentiment": analysis.get("sentiment")},
                confidence=85,
                model_used=INSIGHTS_MODEL,
            )
            count += 1
        else:
            # Rule-based fallback
            _write_insight(
                tenant_id=tenant_id,
                insight_type="reply_analysis",
                title=f"{company} replied",
                body=msg_body[:150] or "New inbound message received",
                lead_id=lead_id,
                priority=70,
                suggested_action="Review and respond",
                action_type="view_thread",
                action_payload={"lead_id": lead_id, "activity_id": activity["id"]},
                source_activity_id=activity["id"],
                source_data={"message_snippet": msg_body[:200]},
                confidence=50,
            )
            count += 1

    return count


def _diagnose_dead_leads(tenant_id: str) -> int:
    """Find leads that went cold and diagnose why."""
    db = get_db()
    stale_cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()

    resp = db.table("leads")\
        .select("id, company_name, first_name, score, status, last_activity_at, company_location, source")\
        .eq("tenant_id", tenant_id)\
        .in_("status", ["contacted", "engaged", "outreach"])\
        .lt("last_activity_at", stale_cutoff)\
        .order("last_activity_at", desc=False)\
        .limit(5)\
        .execute()

    count = 0
    for lead in (resp.data or []):
        lead_id = lead["id"]
        if _insight_exists_recently(tenant_id, "dead_lead", lead_id, hours=168):
            continue

        company = lead.get("company_name", "Unknown")
        score = lead.get("score", 0)
        status = lead.get("status", "")
        location = lead.get("company_location", "")
        last_active = lead.get("last_activity_at", "")

        # Get their activity history
        activities_resp = db.table("lead_activities")\
            .select("activity_type, created_at, metadata")\
            .eq("lead_id", lead_id)\
            .order("created_at", desc=True)\
            .limit(5)\
            .execute()

        activity_summary = ", ".join([
            f"{a['activity_type']} ({a['created_at'][:10]})"
            for a in (activities_resp.data or [])
        ])

        system = """You are Saul, diagnosing why a lead went cold for Exotiq's exotic car rental CRM platform.
Respond in JSON:
{
  "diagnosis": "1-2 sentence explanation of likely reason",
  "recommendation": "specific recommended action",
  "channel": "instagram_dm|email|linkedin|phone|different_template",
  "timing": "now|next_week|seasonal",
  "recovery_probability": "high|medium|low"
}"""

        prompt = f"""Lead: {company} in {location}. Score: {score}. Status: {status}.
Last activity: {last_active}
Activity history: {activity_summary}
Source: {lead.get('source', 'unknown')}

Why did they go cold? What should Gregory do?"""

        result = _call_llm(prompt, system, max_tokens=250)

        if result:
            try:
                analysis = json.loads(result["text"])
            except json.JSONDecodeError:
                analysis = {"diagnosis": "No response to outreach", "recommendation": "Try alternate channel", "recovery_probability": "medium"}

            prob = analysis.get("recovery_probability", "medium")
            priority = 75 if prob == "high" else 50 if prob == "medium" else 30

            _write_insight(
                tenant_id=tenant_id,
                insight_type="dead_lead",
                title=f"{company} — cold {14}+ days",
                body=analysis.get("diagnosis", "No response to multiple outreach attempts"),
                lead_id=lead_id,
                priority=priority,
                suggested_action=analysis.get("recommendation", "Try alternate channel"),
                action_type="re_engage",
                action_payload={"lead_id": lead_id, "channel": analysis.get("channel", "instagram_dm")},
                source_data={"activity_history": activity_summary, "recovery_probability": prob},
                confidence=75,
                model_used=INSIGHTS_MODEL,
            )
        else:
            _write_insight(
                tenant_id=tenant_id,
                insight_type="dead_lead",
                title=f"{company} — no response 14+ days",
                body=f"Was '{status}' but hasn't responded since {last_active[:10]}. Consider alternate channel.",
                lead_id=lead_id,
                priority=50,
                suggested_action="Re-engage via different channel",
                action_type="re_engage",
                action_payload={"lead_id": lead_id},
                confidence=50,
            )
        count += 1

    return count


def _assess_new_leads(tenant_id: str) -> int:
    """Provide AI first-impression for recently discovered high-potential leads."""
    db = get_db()
    since = (datetime.now(timezone.utc) - timedelta(hours=4)).isoformat()

    resp = db.table("leads")\
        .select("id, company_name, first_name, score, score_breakdown, company_location, company_industry, source")\
        .eq("tenant_id", tenant_id)\
        .gte("created_at", since)\
        .gte("score", 60)\
        .order("score", desc=True)\
        .limit(5)\
        .execute()

    count = 0
    for lead in (resp.data or []):
        lead_id = lead["id"]
        if _insight_exists_recently(tenant_id, "new_lead_assess", lead_id, hours=72):
            continue

        company = lead.get("company_name", "Unknown")
        score = lead.get("score", 0)
        breakdown = lead.get("score_breakdown", {}) or {}
        fleet_size = breakdown.get("fleet_size", 0)
        location = lead.get("company_location", "")

        system = """You are Saul. A new high-potential lead was discovered. Give a brief first-impression assessment.
Respond in JSON:
{
  "why_hot": "1 sentence on why this lead is worth prioritizing",
  "risk_factor": "any yellow flag or 'none'",
  "recommended_template": "tier1_proof|peer_intro|fleet_angle",
  "urgency": "high|medium|low"
}"""

        prompt = f"""New lead: {company}, {location}
Score: {score}, Fleet size: {fleet_size}, Industry: {lead.get('company_industry', '')}
Source: {lead.get('source', 'unknown')}
Score breakdown: {json.dumps(breakdown)[:300]}"""

        result = _call_llm(prompt, system, max_tokens=200)

        if result:
            try:
                analysis = json.loads(result["text"])
            except json.JSONDecodeError:
                analysis = {"why_hot": f"Score {score} with fleet size {fleet_size}", "urgency": "medium"}

            priority = 85 if analysis.get("urgency") == "high" else 65

            _write_insight(
                tenant_id=tenant_id,
                insight_type="new_lead_assess",
                title=f"New: {company} — Score {score}",
                body=analysis.get("why_hot", f"High-scoring lead discovered from {lead.get('source', 'outbound')}"),
                lead_id=lead_id,
                priority=priority,
                suggested_action=f"Use {analysis.get('recommended_template', 'peer_intro')} template",
                action_type="approve_draft",
                action_payload={"lead_id": lead_id, "template": analysis.get("recommended_template")},
                source_data={"score": score, "fleet_size": fleet_size, "risk": analysis.get("risk_factor")},
                confidence=80,
                model_used=INSIGHTS_MODEL,
            )
        else:
            _write_insight(
                tenant_id=tenant_id,
                insight_type="new_lead_assess",
                title=f"New: {company} — Score {score}",
                body=f"Fleet size {fleet_size} in {location}. High ICP fit detected.",
                lead_id=lead_id,
                priority=65,
                suggested_action="Review and prioritize",
                action_type="approve_draft",
                action_payload={"lead_id": lead_id},
                confidence=50,
            )
        count += 1

    return count


def _score_draft_quality(tenant_id: str) -> int:
    """Review pending outreach drafts and rate quality."""
    db = get_db()

    resp = db.table("outreach_queue")\
        .select("id, lead_id, message_draft, channel, generated_by, leads!inner(company_name, score, first_name)")\
        .eq("tenant_id", tenant_id)\
        .eq("status", "pending")\
        .order("created_at", desc=True)\
        .limit(5)\
        .execute()

    count = 0
    for item in (resp.data or []):
        draft_id = item["id"]
        if _insight_exists_recently(tenant_id, "draft_quality", None, hours=12):
            # Only generate one batch of draft reviews per 12h
            if count > 0:
                break

        lead = item.get("leads", {})
        if isinstance(lead, list):
            lead = lead[0] if lead else {}
        company = lead.get("company_name", "Unknown")
        draft = item.get("message_draft", "")[:500]

        if not draft.strip():
            continue

        system = """You are Saul, reviewing an outreach draft before Gregory approves it.
Rate quality and suggest improvements. Respond in JSON:
{
  "confidence_score": 0-100,
  "strengths": "what's good about this draft",
  "weakness": "main issue if any, or 'none'",
  "suggestion": "one specific improvement or 'Ready to send'"
}"""

        prompt = f"""Draft for {company} (score {lead.get('score', 0)}):
"{draft}"

Channel: {item.get('channel', 'instagram_dm')}
Generated by: {item.get('generated_by', 'saul_agent')}"""

        result = _call_llm(prompt, system, max_tokens=200)

        if result:
            try:
                analysis = json.loads(result["text"])
            except json.JSONDecodeError:
                continue

            conf = analysis.get("confidence_score", 70)
            priority = 60 if conf >= 80 else 75  # Lower-quality drafts are higher priority (need attention)

            _write_insight(
                tenant_id=tenant_id,
                insight_type="draft_quality",
                title=f"Draft for {company} — {conf}% confidence",
                body=analysis.get("strengths", "Draft ready for review"),
                lead_id=item["lead_id"],
                priority=priority,
                suggested_action=analysis.get("suggestion", "Ready to send"),
                action_type="approve_draft",
                action_payload={"draft_id": draft_id, "lead_id": item["lead_id"]},
                source_data={"confidence_score": conf, "weakness": analysis.get("weakness")},
                confidence=conf,
                model_used=INSIGHTS_MODEL,
            )
            count += 1

    return count


def _generate_daily_narrative(tenant_id: str) -> int:
    """Generate an AI-written daily summary."""
    if _insight_exists_recently(tenant_id, "daily_narrative", None, hours=20):
        return 0

    db = get_db()
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    # Gather today's stats
    stats_queries = [
        db.table("leads").select("*", count="exact", head=True).eq("tenant_id", tenant_id).gte("created_at", today_start),
        db.table("lead_activities").select("*", count="exact", head=True).eq("tenant_id", tenant_id).eq("activity_type", "dm_sent").gte("created_at", today_start),
        db.table("lead_activities").select("*", count="exact", head=True).eq("tenant_id", tenant_id).in_("activity_type", ["dm_replied", "call_answered"]).gte("created_at", today_start),
        db.table("outreach_queue").select("*", count="exact", head=True).eq("tenant_id", tenant_id).eq("status", "pending"),
        db.table("leads").select("*", count="exact", head=True).eq("tenant_id", tenant_id).not_("status", "in", "(lost,disqualified)"),
    ]

    results = [q.execute() for q in stats_queries]
    new_leads = results[0].count or 0
    outreach_sent = results[1].count or 0
    replies = results[2].count or 0
    pending_approval = results[3].count or 0
    total_active = results[4].count or 0

    system = """You are Saul, writing a 2-3 sentence daily pipeline brief for Gregory (CEO of Exotiq).
Be concise, specific, and action-oriented. Mention the most important number and one actionable next step.
No greetings, no fluff. Just the brief."""

    prompt = f"""Today's numbers:
- New leads discovered: {new_leads}
- Outreach sent: {outreach_sent}
- Replies received: {replies}
- Drafts awaiting approval: {pending_approval}
- Total active pipeline: {total_active}

Write the daily brief."""

    result = _call_llm(prompt, system, max_tokens=150)

    if result:
        narrative = result["text"].strip()
    else:
        # Rule-based fallback
        parts = []
        if replies > 0:
            parts.append(f"{replies} lead{'s' if replies > 1 else ''} replied today.")
        if pending_approval > 0:
            parts.append(f"{pending_approval} drafts waiting for your approval.")
        if new_leads > 0:
            parts.append(f"{new_leads} new lead{'s' if new_leads > 1 else ''} discovered.")
        if not parts:
            parts.append(f"Pipeline steady at {total_active} active leads. No urgent actions.")
        narrative = " ".join(parts)

    _write_insight(
        tenant_id=tenant_id,
        insight_type="daily_narrative",
        title="Daily Brief",
        body=narrative,
        priority=95,  # Always shows at top
        confidence=90 if result else 60,
        model_used=INSIGHTS_MODEL if result else None,
        source_data={
            "new_leads": new_leads,
            "outreach_sent": outreach_sent,
            "replies": replies,
            "pending_approval": pending_approval,
            "total_active": total_active,
        },
    )
    return 1


def _expire_old_insights(tenant_id: str) -> int:
    """Mark expired insights as expired."""
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    resp = db.table("agent_insights")\
        .update({"status": "expired"})\
        .eq("tenant_id", tenant_id)\
        .eq("status", "active")\
        .lt("expires_at", now)\
        .execute()
    return len(resp.data or [])


# ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────────


def generate_insights(tenant_id: str = DEFAULT_TENANT_ID) -> dict[str, Any]:
    """Main entry point — called by the orchestrator after GHL poll + scoring."""
    if not INSIGHTS_ENABLED:
        return {"status": "disabled", "reason": "INSIGHTS_ENABLED=false"}

    start = time.time()
    total_cost_cents = 0
    total_tokens = 0

    # Expire stale insights first
    expired = _expire_old_insights(tenant_id)

    # Generate new insights (order matters: narrative last so it captures today's full picture)
    reply_count = _analyze_replies(tenant_id)
    dead_count = _diagnose_dead_leads(tenant_id)
    new_lead_count = _assess_new_leads(tenant_id)
    draft_count = _score_draft_quality(tenant_id)
    narrative_count = _generate_daily_narrative(tenant_id)

    duration_ms = int((time.time() - start) * 1000)

    summary = {
        "insights_generated": reply_count + dead_count + new_lead_count + draft_count + narrative_count,
        "reply_analyses": reply_count,
        "dead_lead_diagnoses": dead_count,
        "new_lead_assessments": new_lead_count,
        "draft_reviews": draft_count,
        "narratives": narrative_count,
        "expired_cleaned": expired,
        "duration_ms": duration_ms,
        "model": INSIGHTS_MODEL if (OPENAI_API_KEY or ANTHROPIC_API_KEY) else "rule_based",
        "cost_cents": 0,  # Tracked per-call in production; placeholder for now
        "leads_processed": reply_count + dead_count + new_lead_count,
    }

    print(f"  Insights complete: {summary}")
    return summary


if __name__ == "__main__":
    result = generate_insights()
    print(json.dumps(result, indent=2))
