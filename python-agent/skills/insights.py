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

Design:
  - Primary LLM: Anthropic Haiku 4.5 via the official SDK.
    * Tool-use for guaranteed JSON shape (no fragile json.loads on freeform text).
    * Prompt caching on the system prompt (saves ~75% on repeat calls).
  - Fallback: OpenAI gpt-4o-mini when ANTHROPIC_API_KEY is unset and
    OPENAI_API_KEY is present. Same JSON contract, parsed defensively.
  - Final fallback: rule-based heuristics if no LLM key is configured.
  - Writes directly to agent_insights table in Supabase.
  - Deduplicates: won't re-analyze the same activity/lead twice in 24h.
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
from costs import llm_cost_cents  # noqa: E402

# LLM configuration
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
INSIGHTS_MODEL = os.environ.get("INSIGHTS_MODEL", "claude-haiku-4-5-20251001")
INSIGHTS_OPENAI_MODEL = os.environ.get("INSIGHTS_OPENAI_MODEL", "gpt-4o-mini")
INSIGHTS_ENABLED = os.environ.get("INSIGHTS_ENABLED", "true").lower() in ("true", "1", "yes")

DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"

# Insight expiry windows (hours)
EXPIRY_HOURS = {
    "reply_analysis": 48,
    "dead_lead": 168,
    "new_lead_assess": 72,
    "draft_quality": 24,
    "daily_narrative": 24,
    "opportunity": 72,
    "risk_alert": 48,
}

# Shared system prompt fragment — gets cached by Anthropic's prompt cache.
SAUL_PERSONA = """You are Saul, an AI sales intelligence agent embedded in
Exotiq's lead pipeline (Exotiq is an exotic car rental CRM; the MedSpa tenant
sells aesthetic-clinic services). You analyze recent pipeline activity and
produce structured, action-oriented insights for Gregory (CEO) to review
in the Daily Brief.

Voice: concise, peer-to-peer, confident. No fluff, no greetings.
Always respond by calling the provided tool — never reply with free text."""


def _anthropic_client():
    """Lazy-init the Anthropic SDK client."""
    from anthropic import Anthropic
    return Anthropic(api_key=ANTHROPIC_API_KEY)


def _call_anthropic_tool(
    user_prompt: str,
    tool_name: str,
    tool_description: str,
    tool_schema: dict,
    max_tokens: int = 400,
) -> Optional[dict]:
    """Call Anthropic with a forced tool-use response.

    Returns {"data": <tool input dict>, "input_tokens": int, "output_tokens": int,
    "cache_read_tokens": int} or None on failure.
    """
    try:
        client = _anthropic_client()
        # System prompt as a cacheable block — Anthropic charges 0.25x on cache hits.
        resp = client.messages.create(
            model=INSIGHTS_MODEL,
            max_tokens=max_tokens,
            system=[
                {
                    "type": "text",
                    "text": SAUL_PERSONA,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=[
                {
                    "name": tool_name,
                    "description": tool_description,
                    "input_schema": tool_schema,
                }
            ],
            tool_choice={"type": "tool", "name": tool_name},
            messages=[{"role": "user", "content": user_prompt}],
        )
        # Extract the tool_use block
        tool_input: Optional[dict] = None
        for block in resp.content:
            if getattr(block, "type", None) == "tool_use":
                tool_input = dict(block.input)
                break
        if tool_input is None:
            return None
        usage = resp.usage
        return {
            "data": tool_input,
            "input_tokens": getattr(usage, "input_tokens", 0) or 0,
            "output_tokens": getattr(usage, "output_tokens", 0) or 0,
            "cache_read_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
        }
    except Exception as e:
        print(f"  ! Anthropic tool call failed: {e}")
        return None


def _call_openai_json(
    user_prompt: str,
    system_prompt: str,
    max_tokens: int = 400,
) -> Optional[dict]:
    """Fallback: OpenAI chat completions with response_format=json_object.

    Less reliable than tool-use (no enforced schema) but better than nothing.
    """
    import requests
    try:
        r = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": INSIGHTS_OPENAI_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "max_tokens": max_tokens,
                "temperature": 0.3,
                "response_format": {"type": "json_object"},
            },
            timeout=30,
        )
        if r.status_code != 200:
            print(f"  ! OpenAI error: {r.status_code} {r.text[:200]}")
            return None
        data = r.json()
        raw = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return None
        return {
            "data": parsed,
            "input_tokens": usage.get("prompt_tokens", 0),
            "output_tokens": usage.get("completion_tokens", 0),
            "cache_read_tokens": 0,
        }
    except Exception as e:
        print(f"  ! OpenAI call failed: {e}")
        return None


def _call_llm(
    user_prompt: str,
    tool_name: str,
    tool_description: str,
    tool_schema: dict,
    max_tokens: int = 400,
) -> Optional[dict]:
    """Unified LLM call. Returns {data, input_tokens, output_tokens, model, cost_cents} or None."""
    result: Optional[dict] = None
    model_used: Optional[str] = None

    if ANTHROPIC_API_KEY:
        result = _call_anthropic_tool(user_prompt, tool_name, tool_description, tool_schema, max_tokens)
        model_used = INSIGHTS_MODEL
    elif OPENAI_API_KEY:
        # Inline the schema into the system prompt as guidance, since OpenAI
        # response_format=json_object doesn't enforce a schema in the basic path.
        schema_hint = f"\n\nReturn JSON matching this schema: {json.dumps(tool_schema)}"
        result = _call_openai_json(
            user_prompt,
            SAUL_PERSONA + schema_hint,
            max_tokens,
        )
        model_used = INSIGHTS_OPENAI_MODEL

    if result is None:
        return None

    cost = llm_cost_cents(
        model_used or "",
        result["input_tokens"],
        result["output_tokens"],
    )
    result["model"] = model_used
    result["cost_cents"] = cost
    return result


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
        "action_payload": json.dumps(action_payload) if action_payload else None,
        "source_activity_id": source_activity_id,
        "source_data": json.dumps(source_data) if source_data else None,
        "confidence": confidence,
        "model_used": model_used,
        "expires_at": expires_at,
    }).execute()


# ─── Tool schemas ─────────────────────────────────────────────────────────────

REPLY_TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {"type": "string", "enum": ["interested", "objection", "question", "booking_request", "not_interested", "unclear"]},
        "sentiment": {"type": "string", "enum": ["positive", "neutral", "negative"]},
        "summary": {"type": "string", "description": "One sentence summary of what they said"},
        "suggested_reply": {"type": "string", "description": "2-3 sentence suggested response in Gregory's voice (casual, confident, peer-to-peer)"},
        "urgency": {"type": "string", "enum": ["high", "medium", "low"]},
    },
    "required": ["intent", "sentiment", "summary", "suggested_reply", "urgency"],
}

DEAD_LEAD_TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        "diagnosis": {"type": "string", "description": "1-2 sentence explanation of likely reason"},
        "recommendation": {"type": "string", "description": "Specific recommended action"},
        "channel": {"type": "string", "enum": ["instagram_dm", "email", "linkedin", "phone", "different_template"]},
        "timing": {"type": "string", "enum": ["now", "next_week", "seasonal"]},
        "recovery_probability": {"type": "string", "enum": ["high", "medium", "low"]},
    },
    "required": ["diagnosis", "recommendation", "channel", "recovery_probability"],
}

NEW_LEAD_TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        "why_hot": {"type": "string", "description": "1 sentence on why this lead is worth prioritizing"},
        "risk_factor": {"type": "string", "description": "Any yellow flag or 'none'"},
        "recommended_template": {"type": "string", "enum": ["tier1_proof", "peer_intro", "fleet_angle"]},
        "urgency": {"type": "string", "enum": ["high", "medium", "low"]},
    },
    "required": ["why_hot", "recommended_template", "urgency"],
}

DRAFT_TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        "confidence_score": {"type": "integer", "minimum": 0, "maximum": 100},
        "strengths": {"type": "string", "description": "What's good about this draft"},
        "weakness": {"type": "string", "description": "Main issue if any, or 'none'"},
        "suggestion": {"type": "string", "description": "One specific improvement or 'Ready to send'"},
    },
    "required": ["confidence_score", "strengths", "suggestion"],
}

NARRATIVE_TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        "brief": {"type": "string", "description": "2-3 sentence daily pipeline brief, no greetings, action-oriented"},
    },
    "required": ["brief"],
}


# ─── INSIGHT GENERATORS ───────────────────────────────────────────────────────


def _analyze_replies(tenant_id: str) -> tuple[int, int, int]:
    """Returns (count, cost_cents, tokens)."""
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
    total_cost = 0
    total_tokens = 0

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

        prompt = (
            f"Lead: {company} ({first_name}), Score: {score}\n"
            f'Their message: "{msg_body}"\n\n'
            "Classify intent and suggest Gregory's next move."
        )

        result = _call_llm(
            prompt,
            tool_name="record_reply_analysis",
            tool_description="Record the analysis of an inbound lead reply.",
            tool_schema=REPLY_TOOL_SCHEMA,
            max_tokens=400,
        )

        if result:
            analysis = result["data"]
            total_cost += result["cost_cents"]
            total_tokens += result["input_tokens"] + result["output_tokens"]
            urgency = analysis.get("urgency", "medium")
            priority = 90 if urgency == "high" else 70 if urgency == "medium" else 50
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
                model_used=result["model"],
            )
        else:
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

    return count, total_cost, total_tokens


def _diagnose_dead_leads(tenant_id: str) -> tuple[int, int, int]:
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
    total_cost = 0
    total_tokens = 0

    for lead in (resp.data or []):
        lead_id = lead["id"]
        if _insight_exists_recently(tenant_id, "dead_lead", lead_id, hours=168):
            continue

        company = lead.get("company_name", "Unknown")
        score = lead.get("score", 0)
        status = lead.get("status", "")
        location = lead.get("company_location", "")
        last_active = lead.get("last_activity_at", "")

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

        prompt = (
            f"Lead: {company} in {location}. Score: {score}. Status: {status}.\n"
            f"Last activity: {last_active}\n"
            f"Activity history: {activity_summary}\n"
            f"Source: {lead.get('source', 'unknown')}\n\n"
            "Why did they go cold? What should Gregory do?"
        )

        result = _call_llm(
            prompt,
            tool_name="record_dead_lead_diagnosis",
            tool_description="Diagnose why a lead went cold and recommend next steps.",
            tool_schema=DEAD_LEAD_TOOL_SCHEMA,
            max_tokens=300,
        )

        if result:
            analysis = result["data"]
            total_cost += result["cost_cents"]
            total_tokens += result["input_tokens"] + result["output_tokens"]
            prob = analysis.get("recovery_probability", "medium")
            priority = 75 if prob == "high" else 50 if prob == "medium" else 30

            _write_insight(
                tenant_id=tenant_id,
                insight_type="dead_lead",
                title=f"{company} — cold 14+ days",
                body=analysis.get("diagnosis", "No response to multiple outreach attempts"),
                lead_id=lead_id,
                priority=priority,
                suggested_action=analysis.get("recommendation", "Try alternate channel"),
                action_type="re_engage",
                action_payload={"lead_id": lead_id, "channel": analysis.get("channel", "instagram_dm")},
                source_data={"activity_history": activity_summary, "recovery_probability": prob},
                confidence=75,
                model_used=result["model"],
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

    return count, total_cost, total_tokens


def _assess_new_leads(tenant_id: str) -> tuple[int, int, int]:
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
    total_cost = 0
    total_tokens = 0

    for lead in (resp.data or []):
        lead_id = lead["id"]
        if _insight_exists_recently(tenant_id, "new_lead_assess", lead_id, hours=72):
            continue

        company = lead.get("company_name", "Unknown")
        score = lead.get("score", 0)
        breakdown = lead.get("score_breakdown", {}) or {}
        fleet_size = breakdown.get("fleet_size", 0)
        location = lead.get("company_location", "")

        prompt = (
            f"New lead: {company}, {location}\n"
            f"Score: {score}, Fleet size: {fleet_size}, Industry: {lead.get('company_industry', '')}\n"
            f"Source: {lead.get('source', 'unknown')}\n"
            f"Score breakdown: {json.dumps(breakdown)[:300]}"
        )

        result = _call_llm(
            prompt,
            tool_name="record_new_lead_assessment",
            tool_description="First-impression assessment of a freshly discovered lead.",
            tool_schema=NEW_LEAD_TOOL_SCHEMA,
            max_tokens=250,
        )

        if result:
            analysis = result["data"]
            total_cost += result["cost_cents"]
            total_tokens += result["input_tokens"] + result["output_tokens"]
            priority = 85 if analysis.get("urgency") == "high" else 65

            _write_insight(
                tenant_id=tenant_id,
                insight_type="new_lead_assess",
                title=f"New: {company} — Score {score}",
                body=analysis.get("why_hot", f"High-scoring lead from {lead.get('source', 'outbound')}"),
                lead_id=lead_id,
                priority=priority,
                suggested_action=f"Use {analysis.get('recommended_template', 'peer_intro')} template",
                action_type="approve_draft",
                action_payload={"lead_id": lead_id, "template": analysis.get("recommended_template")},
                source_data={"score": score, "fleet_size": fleet_size, "risk": analysis.get("risk_factor")},
                confidence=80,
                model_used=result["model"],
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

    return count, total_cost, total_tokens


def _score_draft_quality(tenant_id: str) -> tuple[int, int, int]:
    db = get_db()

    resp = db.table("outreach_queue")\
        .select("id, lead_id, message_draft, channel, generated_by, leads!inner(company_name, score, first_name)")\
        .eq("tenant_id", tenant_id)\
        .eq("status", "pending")\
        .order("created_at", desc=True)\
        .limit(5)\
        .execute()

    count = 0
    total_cost = 0
    total_tokens = 0

    for item in (resp.data or []):
        draft_id = item["id"]
        if _insight_exists_recently(tenant_id, "draft_quality", None, hours=12) and count > 0:
            break

        lead = item.get("leads", {})
        if isinstance(lead, list):
            lead = lead[0] if lead else {}
        company = lead.get("company_name", "Unknown")
        draft = item.get("message_draft", "")[:500]

        if not draft.strip():
            continue

        prompt = (
            f"Draft for {company} (score {lead.get('score', 0)}):\n"
            f'"{draft}"\n\n'
            f"Channel: {item.get('channel', 'instagram_dm')}\n"
            f"Generated by: {item.get('generated_by', 'saul_agent')}"
        )

        result = _call_llm(
            prompt,
            tool_name="record_draft_quality",
            tool_description="Rate quality of an outreach draft and suggest improvements.",
            tool_schema=DRAFT_TOOL_SCHEMA,
            max_tokens=250,
        )

        if result:
            analysis = result["data"]
            total_cost += result["cost_cents"]
            total_tokens += result["input_tokens"] + result["output_tokens"]
            conf = analysis.get("confidence_score", 70)
            priority = 60 if conf >= 80 else 75

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
                model_used=result["model"],
            )
            count += 1

    return count, total_cost, total_tokens


def _generate_daily_narrative(tenant_id: str) -> tuple[int, int, int]:
    if _insight_exists_recently(tenant_id, "daily_narrative", None, hours=20):
        return 0, 0, 0

    db = get_db()
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

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

    prompt = (
        "Today's numbers:\n"
        f"- New leads discovered: {new_leads}\n"
        f"- Outreach sent: {outreach_sent}\n"
        f"- Replies received: {replies}\n"
        f"- Drafts awaiting approval: {pending_approval}\n"
        f"- Total active pipeline: {total_active}\n\n"
        "Write a 2-3 sentence daily brief for Gregory. Be concise, specific, "
        "action-oriented. Mention the most important number and one actionable next step."
    )

    result = _call_llm(
        prompt,
        tool_name="record_daily_brief",
        tool_description="Write a short daily pipeline brief.",
        tool_schema=NARRATIVE_TOOL_SCHEMA,
        max_tokens=200,
    )

    if result:
        narrative = result["data"].get("brief", "").strip()
        cost = result["cost_cents"]
        tokens = result["input_tokens"] + result["output_tokens"]
        model = result["model"]
    else:
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
        cost = 0
        tokens = 0
        model = None

    _write_insight(
        tenant_id=tenant_id,
        insight_type="daily_narrative",
        title="Daily Brief",
        body=narrative or "Pipeline summary unavailable",
        priority=95,
        confidence=90 if result else 60,
        model_used=model,
        source_data={
            "new_leads": new_leads,
            "outreach_sent": outreach_sent,
            "replies": replies,
            "pending_approval": pending_approval,
            "total_active": total_active,
        },
    )
    return 1, cost, tokens


def _expire_old_insights(tenant_id: str) -> int:
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
    expired = _expire_old_insights(tenant_id)

    reply_count, reply_cost, reply_tokens = _analyze_replies(tenant_id)
    dead_count, dead_cost, dead_tokens = _diagnose_dead_leads(tenant_id)
    new_lead_count, new_cost, new_tokens = _assess_new_leads(tenant_id)
    draft_count, draft_cost, draft_tokens = _score_draft_quality(tenant_id)
    narrative_count, narr_cost, narr_tokens = _generate_daily_narrative(tenant_id)

    total_cost = reply_cost + dead_cost + new_cost + draft_cost + narr_cost
    total_tokens = reply_tokens + dead_tokens + new_tokens + draft_tokens + narr_tokens
    duration_ms = int((time.time() - start) * 1000)

    if ANTHROPIC_API_KEY:
        model_label = INSIGHTS_MODEL
    elif OPENAI_API_KEY:
        model_label = INSIGHTS_OPENAI_MODEL
    else:
        model_label = "rule_based"

    summary = {
        "insights_generated": reply_count + dead_count + new_lead_count + draft_count + narrative_count,
        "reply_analyses": reply_count,
        "dead_lead_diagnoses": dead_count,
        "new_lead_assessments": new_lead_count,
        "draft_reviews": draft_count,
        "narratives": narrative_count,
        "expired_cleaned": expired,
        "duration_ms": duration_ms,
        "model": model_label,
        "cost_cents": total_cost,
        "tokens_used": total_tokens,
        "leads_processed": reply_count + dead_count + new_lead_count,
    }

    print(f"  Insights complete: {summary}")
    return summary


if __name__ == "__main__":
    result = generate_insights()
    print(json.dumps(result, indent=2))
