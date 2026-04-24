"""
Supabase database client for the Saul Agent Service.
Uses the service role key to bypass RLS.
"""

from typing import Optional
from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_SERVICE_KEY

_client: Optional[Client] = None


def get_db() -> Client:
    """Return a Supabase client using the service role key (bypasses RLS)."""
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _client
