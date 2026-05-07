# Saul OpenClaw — AI Insights Integration Handoff

**Date:** 2026-05-07
**Feature:** Proactive AI Insights for Daily Brief
**Migration:** `supabase/migrations/011_agent_insights.sql`
**Skill file:** `python-agent/skills/insights.py`

---

## What This Does

A new step has been added to the pipeline: **Step 5 — AI Insights**. It runs after GHL poll + scoring each cycle (every 15 minutes) and writes proactive, actionable intelligence cards to the `agent_insights` table. The dashboard's Daily Brief drawer reads these and presents them to Gregory as AI-powered action cards.

This transforms the system from **reactive** (Gregory checks the dashboard) to **proactive** (the system tells Gregory what needs attention and suggests exactly what to do).

---

## New Pipeline Step

```
Discover → Enrich → Score → GHL Poll → Draft → ✨ Insights ✨ → Done
```

The insights skill (`python-agent/skills/insights.py`) generates 5 types of cards:

| Type | What It Does | LLM Prompt Intent |
|------|-------------|-------------------|
| `reply_analysis` | Scrubs inbound messages, classifies intent (interested/objection/question/booking_request/not_interested), suggests Gregory's response | "Classify this reply and suggest next move" |
| `dead_lead` | Diagnoses why a lead went cold. Checks activity history, timing, channel used. Recommends re-engagement channel + timing | "Why did they go cold? What should Gregory do?" |
| `new_lead_assess` | First-impression scoring for high-potential newly discovered leads (score 60+). Explains why it's hot, recommends template | "Why is this lead worth prioritizing?" |
| `draft_quality` | Reviews pending outreach drafts before human approval. Rates confidence 0-100, flags weak hooks or generic openings | "Rate this draft quality and suggest improvements" |
| `daily_narrative` | 2-3 sentence executive summary of pipeline health. Mentions the most important number + one actionable next step | "Write today's pipeline brief for Gregory" |

---

## Database Schema: `agent_insights`

```sql
CREATE TABLE agent_insights (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  lead_id         uuid REFERENCES leads(id),
  insight_type    text NOT NULL,           -- reply_analysis, dead_lead, new_lead_assess, draft_quality, daily_narrative, opportunity, risk_alert
  priority        smallint DEFAULT 50,     -- 0=low, 50=normal, 100=urgent
  status          text DEFAULT 'active',   -- active, dismissed, actioned, expired
  title           text NOT NULL,
  body            text NOT NULL,
  suggested_action text,                   -- one-line CTA
  action_type     text,                    -- approve_draft, re_engage, mark_dead, defer, view_thread
  action_payload  jsonb,                   -- data for executing the action
  source_activity_id uuid REFERENCES lead_activities(id),
  source_data     jsonb,                   -- raw context used for generation
  confidence      smallint,                -- 0-100
  model_used      text,                    -- gpt-4o-mini, claude-sonnet-4-20250514, etc.
  expires_at      timestamptz,
  actioned_at     timestamptz,
  dismissed_at    timestamptz,
  created_at      timestamptz DEFAULT now()
);
```

---

## Environment Variables Needed

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `OPENAI_API_KEY` | One of OpenAI or Anthropic | — | LLM calls for insight generation |
| `ANTHROPIC_API_KEY` | One of OpenAI or Anthropic | — | Alternative LLM provider |
| `INSIGHTS_MODEL` | No | `gpt-4o-mini` | Which model to use (cost/speed tradeoff) |
| `INSIGHTS_ENABLED` | No | `true` | Kill switch to disable insights without removing code |

If neither LLM key is set, the skill falls back to **rule-based heuristics** — still useful, just less smart (no message classification, no diagnosis narrative, simpler fallback text).

---

## How to Run

The insights skill is called automatically by `main.py` as Step 5:

```python
from skills.insights import generate_insights
# ... in run_pipeline():
insights_result = generate_insights(tenant_id=tenant_id)
```

To run standalone for testing:
```bash
cd python-agent
python -c "from skills.insights import generate_insights; print(generate_insights())"
```

---

## Deduplication & Lifecycle

- **Dedup:** Won't re-analyze the same lead/type within a configurable window (24h for replies, 7 days for dead leads, 72h for new assessments)
- **Expiry:** Each insight has an `expires_at` timestamp. The skill auto-cleans expired insights at the start of each run.
- **Dismissal:** When a user dismisses an insight in the UI, the frontend PATCHes `status` → `dismissed`
- **Actioned:** When a user clicks the action button, `status` → `actioned`

---

## Cost Expectations

With `gpt-4o-mini` ($0.15/1M input, $0.60/1M output):
- Each insight call uses ~200 input tokens + ~100 output tokens
- At ~15 insights per cycle, 96 cycles/day: ~$0.20/day
- With Claude Sonnet: ~$1.50/day (higher quality, much more expensive)

Recommend `gpt-4o-mini` for production, Anthropic for evaluation/testing.

---

## What the Dashboard Shows

The Daily Brief drawer now has an **AI Insights** section between the narrative and priority actions:

1. **Daily Narrative** — cyan-tinted card at the very top with the executive summary
2. **AI Action Cards** — color-coded by type (emerald for replies, amber for dead leads, cyan for opportunities, violet for draft reviews)
3. Each card shows: title, body, confidence %, and a suggested action with an arrow indicator

---

## Future Enhancements (Not Built Yet)

1. **Action buttons** — clicking "Re-engage" or "Approve Draft" from the insight card executes the action directly (PATCH to relevant API)
2. **Feedback loop** — track which insights Gregory acts on vs dismisses; use this to tune prompt quality over time
3. **Opportunity detection** — spot timing patterns (e.g., leads who opened links 3x → ready for call)
4. **Risk alerts** — detect competitor mentions in replies, negative sentiment patterns across multiple leads
5. **MedSpa-specific prompts** — customize the system prompts for the MedSpa vertical (different language, different signals)

---

## Migration Checklist

- [ ] Apply `supabase/migrations/011_agent_insights.sql` to production Supabase
- [ ] Set `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY`) in the Python agent's environment
- [ ] Confirm `INSIGHTS_ENABLED=true` (default)
- [ ] Restart the Python agent to pick up the new skill
- [ ] Verify insights appear: `SELECT * FROM agent_insights ORDER BY created_at DESC LIMIT 5;`
