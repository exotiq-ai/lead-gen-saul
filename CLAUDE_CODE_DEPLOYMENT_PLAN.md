# Claude Code Sessions — Deployment Plan for Saul's Python Agent

**Date:** 2026-05-13
**Replaces:** OpenClaw agent service
**Goal:** Run the Saul Python pipeline (discover → enrich → score → draft → insights) on a persistent, scheduled Claude Code session that costs ~$3-5/day and requires zero babysitting.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Railway / Fly.io VPS                         │
│                                                                   │
│  ┌─────────────┐    cron (*/15 * * * *)    ┌──────────────────┐ │
│  │  systemd    │ ───────────────────────── │  python main.py  │ │
│  │  timer      │                            │                  │ │
│  └─────────────┘                            │  Skills:         │ │
│                                             │  • discover      │ │
│                                             │  • enrich        │ │
│        ┌──────────────────────┐             │  • score         │ │
│        │  Claude Code SDK     │◄────────── │  • draft         │ │
│        │  (insights skill)    │             │  • ghl_poll      │ │
│        │                      │             │  • insights ←LLM │ │
│        └──────────────────────┘             └──────────────────┘ │
│                    │                                  │           │
└────────────────────│──────────────────────────────────│───────────┘
                     │                                  │
                     ▼                                  ▼
            api.anthropic.com                   Supabase (DB)
            (Claude Sonnet/Haiku)               + GHL APIs
                                                + Apollo API
```

---

## Phase 1: Hosting Setup (Human Task)

### Option A: Railway (recommended for simplicity)
- Sign up at railway.app
- Create a new project → add a service from GitHub repo (point to `python-agent/` directory)
- Set environment variables (see env section below)
- Add a cron job: `*/15 * * * * cd /app && python main.py --once`
- Railway auto-deploys on git push to `main`

### Option B: Fly.io (recommended for cost)
- `fly launch` with a Dockerfile
- Use `fly machines run` with a schedule
- Costs ~$3-5/mo for a 256MB machine that wakes every 15 min

### Option C: DigitalOcean Droplet (most control)
- $4/mo smallest droplet
- `systemd` timer running every 15 min
- Full SSH access for debugging

### Recommended: Railway
- Zero-config deploy from GitHub
- Built-in cron scheduling
- Logs visible in dashboard
- Auto-sleep between runs (no idle cost)
- ~$5-10/mo for this workload

---

## Phase 2: Pipeline Modifications

### 2a. Add `--once` flag to main.py

Currently `main.py` runs an infinite loop with `schedule`. For hosted cron, we need a "run once and exit" mode:

```python
# In main.py, modify the __main__ block:
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Run one cycle and exit (for cron)")
    args = parser.parse_args()
    
    if args.once:
        for tid in ALL_TENANTS:
            run_pipeline(tenant_id=tid)
    else:
        main()  # Original infinite loop
```

### 2b. Add Dockerfile

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "main.py", "--once"]
```

### 2c. Update requirements.txt

```
supabase>=2.0.0
python-dotenv>=1.0.0
requests>=2.31.0
schedule>=1.2.0
openai>=1.0.0
```

(Remove `apollo>=0.1.0` which conflicts with the Apollo API — the enrichment uses `requests` directly, not the `apollo` package.)

---

## Phase 3: Claude Code SDK Integration (Optional Enhancement)

If you want Claude to *orchestrate* the pipeline (not just provide LLM calls inside it), you'd use the Claude Agent SDK for a more sophisticated setup:

```python
# orchestrator.py — Claude Code SDK orchestration
from claude_agent_sdk import ClaudeSDKClient

client = ClaudeSDKClient(
    api_key=os.environ["ANTHROPIC_API_KEY"],
    model="claude-sonnet-4-20250514",
)

# Resume the persistent pipeline session
session = client.resume_session("saul-pipeline-session")

# Give Claude context and let it decide what to do
response = session.send("""
Review the current pipeline state:
- Check for new leads that need enrichment
- Score any enriched leads
- Analyze replies from GHL
- Generate insights for the Daily Brief
- Report what you did
""")
```

**When this makes sense:** When you want Claude to make judgment calls about *whether* to run certain steps (e.g., "Apollo budget is running low, skip enrichment today" or "This lead replied with something unusual, escalate to Gregory directly").

**For now:** The simpler approach (standard `main.py` + LLM calls inside `insights.py`) is more predictable and cheaper. Add SDK orchestration later if you want the agent to make meta-decisions.

---

## Phase 4: Environment Variables

These need to be set on the hosting platform:

| Variable | Value | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qbvkisrazmipmwlejqtf.supabase.co` | |
| `SUPABASE_SERVICE_ROLE_KEY` | (your key) | Service role bypasses RLS |
| `APOLLO_API_KEY` | (your key) | Exotiq enrichment |
| `GOOGLE_PLACES_API_KEY` | (your key) | MedSpa enrichment |
| `GHL_API_KEY` | (your key) | Exotiq GHL polling |
| `GHL_LOCATION_ID` | (your key) | Exotiq sub-account |
| `GHL_MEDSPA_API_KEY` | (your key) | MedSpa GHL polling |
| `GHL_MEDSPA_LOCATION_ID` | (your key) | MedSpa sub-account |
| `OPENAI_API_KEY` | (your key) | For insights (gpt-4o-mini) |
| `INSIGHTS_MODEL` | `gpt-4o-mini` | Cheapest, fast, good enough |
| `INSIGHTS_ENABLED` | `true` | Kill switch |
| `APP_BASE_URL` | `https://leadsbysaul.netlify.app` | For scoring/enrichment API calls |

---

## Phase 5: Monitoring & Observability

### What already exists:
- `agent_runs` table logs every skill execution (duration, cost, leads processed)
- `/dashboard/agents` page shows gateway status + recent runs
- SSE stream of live agent runs

### What to add:
- Railway/Fly.io logs for crash visibility
- A simple health check: if no `agent_runs` row in 30 min, alert (could be a Supabase edge function or Netlify scheduled function)
- Weekly cost summary from `agent_runs.cost_cents` aggregation

---

## Cost Projections

| Component | Cost/Day | Cost/Month |
|-----------|----------|------------|
| Hosting (Railway cron) | ~$0.15 | ~$5 |
| OpenAI gpt-4o-mini (insights) | ~$0.20 | ~$6 |
| Apollo API (enrichment) | ~$2.40 (max, if 20 new leads/cycle) | ~$72 (cap-able) |
| Google Places (MedSpa) | ~$0.40 | ~$12 |
| GHL API | $0 | $0 |
| **Total (typical day)** | **~$3-5** | **~$95-150** |

Compare to OpenClaw: you were paying for an agent platform subscription + token costs + dealing with reliability issues. This is cheaper and fully under your control.

---

## Migration Timeline

| Step | Who | What |
|------|-----|------|
| 1 | Human | Choose hosting (Railway recommended) |
| 2 | Human | Create project, connect GitHub repo |
| 3 | Agent (me) | Add `--once` flag + Dockerfile to repo |
| 4 | Human | Set env vars on hosting platform |
| 5 | Human | Apply migration 011 to Supabase |
| 6 | Human | Enable cron schedule (*/15 * * * *) |
| 7 | Both | Verify first run: check `agent_runs` + `agent_insights` tables |
| 8 | Human | Disable/cancel OpenClaw subscription |

---

## Fallback Plan

If Claude Code SDK becomes the preferred orchestrator later:
1. Install `claude-agent-sdk` in requirements
2. Replace `insights.py`'s direct `requests` calls to OpenAI with Claude SDK session calls
3. Optionally let Claude decide which pipeline steps to run (meta-orchestration)
4. The `main.py` structure stays the same — only the LLM callsite changes

This is a non-breaking evolution, not a rewrite.
