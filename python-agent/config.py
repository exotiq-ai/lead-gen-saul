"""
Configuration for the Saul Agent Service.
Loads environment variables and provides typed access.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from python-agent directory, then project root
_agent_dir = Path(__file__).parent
load_dotenv(_agent_dir / ".env")
load_dotenv(_agent_dir.parent / ".env.local")

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
APOLLO_API_KEY = os.environ.get("APOLLO_API_KEY", "")
APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://localhost:3000")

# Agent defaults
ENRICHMENT_BATCH_SIZE = 20
SCORING_BATCH_SIZE = 50
OUTREACH_SCORE_THRESHOLD = 55
DISCOVERY_MAX_PER_RUN = 30
RATE_LIMIT_DELAY = 1.5  # seconds between API calls
