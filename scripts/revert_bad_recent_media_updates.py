#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

TENANT_ID = "00000000-0000-0000-0000-000000000001"
BACKUP = Path("/Users/gbot/.hermes/work/exotiq-enrichment/recent_media_backup_20260624_075250.json")
BAD_IDS = {
    "1e3f083a-c5cd-4510-9817-25f3e01c5070",  # generic Miami top-10 list, not company-specific enough
    "723bb8c0-7670-494e-8862-503ecb55b9a7",  # company name too generic; unrelated rental owner death article
    "7d8b77fa-bb50-48ca-b6e8-42f3ee1ddf91",  # unrelated billionaire article
    "e5dca379-fa6f-47de-99e3-42d16cff196d",  # unrelated rental-car operations article
    "61a00558-b816-4931-93f1-58a292bd0c96",  # unrelated old Miami football article
    "ba4437d6-967f-448b-a9ff-b09148931715",  # unrelated Bravo article
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def main() -> int:
    load_dotenv(".env.local")
    db = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    rows = json.loads(BACKUP.read_text())
    by_id = {r["id"]: r for r in rows}
    restored = []
    for lead_id in BAD_IDS:
        original = by_id.get(lead_id)
        if not original:
            continue
        db.table("leads").update({
            "score_breakdown": original.get("score_breakdown") or {},
            "updated_at": now_iso(),
        }).eq("id", lead_id).eq("tenant_id", TENANT_ID).execute()
        restored.append({"id": lead_id, "company_name": original.get("company_name")})
    print(json.dumps({"restored": restored}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
