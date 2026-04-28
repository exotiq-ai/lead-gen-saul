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

# GHL credentials — Exotiq (default tenant)
GHL_API_KEY = os.environ.get("GHL_API_KEY", "")
GHL_LOCATION_ID = os.environ.get("GHL_LOCATION_ID", "")

# GHL credentials — MedSpa / AskSaul.ai sub-account
GHL_MEDSPA_API_KEY = os.environ.get("GHL_MEDSPA_API_KEY", "")
GHL_MEDSPA_LOCATION_ID = os.environ.get("GHL_MEDSPA_LOCATION_ID", "")
GHL_MEDSPA_PIPELINE_ID = os.environ.get("GHL_MEDSPA_PIPELINE_ID", "")

# Map tenant_id → GHL credentials for multi-tenant routing
DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"
MEDSPA_TENANT_ID = "11111111-1111-1111-1111-111111111111"

GHL_TENANT_CONFIG = {
    DEFAULT_TENANT_ID: {
        "api_key": GHL_API_KEY,
        "location_id": GHL_LOCATION_ID,
        "pipeline_id": "",  # Exotiq pipeline ID (set if known)
    },
    MEDSPA_TENANT_ID: {
        "api_key": GHL_MEDSPA_API_KEY,
        "location_id": GHL_MEDSPA_LOCATION_ID,
        "pipeline_id": GHL_MEDSPA_PIPELINE_ID,
    },
}

# Agent defaults
ENRICHMENT_BATCH_SIZE = 20
SCORING_BATCH_SIZE = 50
OUTREACH_SCORE_THRESHOLD = 55
DISCOVERY_MAX_PER_RUN = 30
RATE_LIMIT_DELAY = 1.5  # seconds between API calls
