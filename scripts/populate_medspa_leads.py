"""Populate MedSpa Boulder tenant with real leads from CSV."""
import os
import sys
import csv
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_SERVICE_KEY

# Create DB client
db = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

TENANT_ID = "11111111-1111-1111-1111-111111111111"

# Read CSV and insert leads
csv_path = "/Users/gbot/.openclaw/workspace/medspa/medspa_lead_database.csv"
print("Loading MedSpa leads from CSV...")

with open(csv_path, newline='', encoding='utf-8') as csvfile:
    reader = csv.DictReader(csvfile)
    for i, row in enumerate(reader):
        # Skip header row
        if not row.get('Business Name'):
            continue
            
        lead_data = {
            "tenant_id": TENANT_ID,
            "company_name": row.get('Business Name'),
            "company_location": row.get('Location'),
            "company_industry": "medspa",
            "source": "csv_import",
            "status": "new",
            "score": 0,
        }
        
        # Optional fields
        if row.get('Website'):
            lead_data["company_domain"] = row.get('Website').replace('https://', '').replace('http://', '')
        if row.get('Contact Email'):
            lead_data["email"] = row.get('Contact Email')
        if row.get('Contact Phone'):
            lead_data["phone"] = row.get('Contact Phone')
            
        try:
            result = db.table("leads").insert(lead_data).execute()
            print(f"  ✓ Added: {row['Business Name']}")
        except Exception as e:
            print(f"  ✗ Failed to add {row['Business Name']}: {e}")

print(f"\n✅ Imported leads into MedSpa tenant {TENANT_ID}")