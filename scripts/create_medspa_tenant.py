"""Create MedSpa Boulder tenant with pipeline stages and ICP profile."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'python-agent'))
from config import SUPABASE_URL, SUPABASE_SERVICE_KEY
from supabase import create_client

db = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

TENANT_ID = "11111111-1111-1111-1111-111111111111"
TENANT_NAME = "MedSpa Boulder"
TENANT_SLUG = "medspa-boulder"

# 1. Create tenant
print("Creating tenant...")
db.table("tenants").upsert({
    "id": TENANT_ID,
    "name": TENANT_NAME,
    "slug": TENANT_SLUG,
    "settings": {
        "industry": "medspa",
        "region": "Boulder/Denver CO",
        "target_size": "5-50 employees",
        "target_type": "owner-operator"
    },
    "branding": {
        "color": "#9b59b6",
        "icon": "💆"
    }
}).execute()
print(f"  ✓ Tenant created: {TENANT_ID}")

# 2. Create pipeline stages
stages = [
    {"name": "Researching",  "slug": "researching",  "position": 1, "color": "#8b5cf6"},
    {"name": "Contacted",    "slug": "contacted",     "position": 2, "color": "#3b82f6"},
    {"name": "Consultation", "slug": "consultation",  "position": 3, "color": "#06b6d4"},
    {"name": "Proposal Sent","slug": "proposal-sent", "position": 4, "color": "#f59e0b"},
    {"name": "Closed Won",   "slug": "won",           "position": 5, "color": "#10b981", "is_terminal": True, "terminal_type": "won"},
    {"name": "Closed Lost",  "slug": "lost",          "position": 6, "color": "#ef4444", "is_terminal": True, "terminal_type": "lost"},
]

print("Creating pipeline stages...")
# Clear any existing stages for this tenant first
db.table("pipeline_stages").delete().eq("tenant_id", TENANT_ID).execute()
for s in stages:
    s["tenant_id"] = TENANT_ID
    db.table("pipeline_stages").insert(s).execute()
    print(f"  ✓ {s['name']}")

# 3. Create ICP profile
print("Creating ICP profile...")
# Clear existing ICP profiles for this tenant
db.table("icp_profiles").delete().eq("tenant_id", TENANT_ID).execute()
db.table("icp_profiles").insert({"tenant_id": TENANT_ID, "name": "MedSpa Owner-Operator",
    "is_active": True,
    "criteria": {
        "industry": ["medspa", "medical spa", "aesthetics", "wellness center", "beauty clinic"],
        "location": ["Boulder", "Denver", "Broomfield", "Louisville", "Lafayette", "Longmont"],
        "state": "CO",
        "employee_range": "5-50",
        "business_type": "owner-operator",
        "signals": [
            "outdated website",
            "no online booking",
            "low Google reviews",
            "no social media presence",
            "template website"
        ],
        "disqualifiers": [
            "franchise chain",
            "corporate-owned",
            "recently redesigned website"
        ]
    }
}).execute()
print("  ✓ ICP profile created")

print(f"\n✅ MedSpa Boulder tenant ready: {TENANT_ID}")
print(f"   Dashboard: https://saul-lead.netlify.app/dashboard?tenant={TENANT_SLUG}")
