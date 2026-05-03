"""
Cost rate table -- mirror of src/lib/utils/costs.ts so TypeScript and
Python emit the same dollars-to-cents math for any agent_runs row.

Stage 3c: every python skill calls into this when it logs a run, so
agent_runs.cost_cents stops being all zeros and /dashboard/economics
stops mixing real numbers with seeded demo data.
"""

from __future__ import annotations

# Anthropic / OpenAI per-1k-token rates (USD).
_MODEL_RATES: dict[str, dict[str, float]] = {
    "claude-sonnet-4-20250514": {"input": 0.003, "output": 0.015},
    "claude-3-5-sonnet": {"input": 0.003, "output": 0.015},
    "gpt-4o": {"input": 0.005, "output": 0.015},
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
}

# Per-call provider rates in cents. Sources:
#   - Apollo: ~12 cents per /people/match used by src/lib/enrichment/apollo.ts
#   - Google Places: ~$0.02 per details call -> 2 cents (see enrich_gmaps.py)
#   - GHL: free at our usage tier
#   - DuckDuckGo HTML: free
PER_CALL_COSTS_CENTS: dict[str, int] = {
    "apollo_people_match": 12,
    "apollo_organization_match": 0,  # bundled into people/match per request
    "google_places_textsearch": 0,
    "google_places_details": 2,
    "ghl_conversations": 0,
    "duckduckgo_html": 0,
}


def llm_cost_cents(model: str, input_tokens: int, output_tokens: int) -> int:
    """Mirror of TypeScript calculateCost(). Returns whole cents."""
    rates = _MODEL_RATES.get(model)
    if not rates:
        return 0
    dollars = (input_tokens / 1000.0) * rates["input"] + (
        output_tokens / 1000.0
    ) * rates["output"]
    return round(dollars * 100)
