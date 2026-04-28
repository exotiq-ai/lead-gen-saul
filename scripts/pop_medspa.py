import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'python-agent'))
from config import SUPABASE_URL, SUPABASE_SERVICE_KEY
from supabase import create_client

db = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
T = "11111111-1111-1111-1111-111111111111"

# Get researching stage ID
stages = db.table("pipeline_stages").select("id,name").eq("tenant_id", T).execute()
stage_map = {s["name"]: s["id"] for s in stages.data}
research_id = stage_map.get("Researching")
print(f"Stages: {list(stage_map.keys())}")
print(f"Researching stage: {research_id}")

leads = [
    {"company_name": "RESTOR Medical Spa", "company_location": "Boulder, CO", "company_domain": "www.restormedicalspa.com"},
    {"company_name": "Vasu Skin Solutions", "company_location": "Boulder, CO"},
    {"company_name": "Rinnova Skin & Body", "company_location": "Boulder, CO"},
    {"company_name": "The Luxe Room", "company_location": "Boulder, CO"},
    {"company_name": "Highline Aesthetics", "company_location": "Boulder, CO"},
    {"company_name": "Rocky Mountain Dermatology", "company_location": "Denver, CO"},
    {"company_name": "Boulder Plastic Surgery & IV Seasons Skin Care", "company_location": "Boulder, CO"},
    {"company_name": "Boulder Aesthetics & Intimate Wellness", "company_location": "Boulder, CO"},
    {"company_name": "LaserAway", "company_location": "Boulder, CO"},
    {"company_name": "Aura Advanced Skin Care & Plastic Surgery", "company_location": "Boulder, CO"},
]

for lead in leads:
    lead["tenant_id"] = T
    lead["company_industry"] = "medspa"
    lead["source"] = "csv_import"
    lead["status"] = "new"
    lead["score"] = 0
    if research_id:
        lead["stage_id"] = research_id
    try:
        db.table("leads").insert(lead).execute()
        print(f"  + {lead['company_name']}")
    except Exception as e:
        print(f"  x {lead['company_name']}: {e}")

# Verify
count = db.table("leads").select("id", count="exact").eq("tenant_id", T).execute()
print(f"\nTotal MedSpa leads: {count.count}")
