"""Create GHL custom fields used by the Local Services lead-gen / Sendblue workflow.

Safe to rerun. Reads GHL_LOCAL_SERVICES_* first, then existing GHL_* creds from .env.local.
"""
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
    from dotenv import load_dotenv
except Exception as exc:
    print(json.dumps({'ok': False, 'error': str(exc)}))
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env.local')
load_dotenv(ROOT / 'python-agent' / '.env')

api = os.getenv('GHL_LOCAL_SERVICES_API_KEY') or os.getenv('GHL_API_KEY') or ''
loc = os.getenv('GHL_LOCAL_SERVICES_LOCATION_ID') or os.getenv('GHL_LOCATION_ID') or ''
if not api or not loc:
    print(json.dumps({'ok': False, 'error': 'missing GHL creds'}))
    sys.exit(0)

base = 'https://services.leadconnectorhq.com'
headers = {
    'Authorization': f'Bearer {api}',
    'Version': '2021-07-28',
    'Accept': 'application/json',
    'Content-Type': 'application/json',
}

fields_to_create = [
    ('Local Services Vertical', 'TEXT', 'HVAC, Garage Doors, Driveways, Aging-in-Place Contractors'),
    ('Lead Project', 'TEXT', 'ask_saul_phone_agents or safetostay_ai'),
    ('Outreach Hold Reason', 'TEXT', 'Reason a lead is excluded from automated Ask Saul phone-agent outreach'),
    ('Outscraper Source Query', 'TEXT', 'Exact Outscraper query that found the business'),
    ('Google Place ID', 'TEXT', 'Google Maps/Places ID from Outscraper'),
    ('Google Maps URL', 'TEXT', 'Google Maps listing URL'),
    ('Google Rating', 'TEXT', 'Rating and review count from Maps'),
    ('Lead Source Run ID', 'TEXT', 'Local Services source run/import ID'),
    ('Sendblue Eligibility', 'TEXT', 'unknown, imessage, sms, rcs, opted_out, blocked'),
    ('Sendblue Service Last Used', 'TEXT', 'iMessage, SMS, or RCS from Sendblue webhook/status'),
    ('Last Sendblue Status', 'TEXT', 'queued, sent, delivered, error, received'),
    ('First Touch Variant', 'TEXT', 'Outreach template variant used for first touch'),
    ('Outreach Approved', 'TEXT', 'true/false; dashboard approval wall before Sendblue/GHL send'),
    ('AI Phone Agent Offer', 'LARGE_TEXT', 'The current local-services 24/7 phone agent offer/copy'),
    ('Demo Phone Agent Number', 'TEXT', 'Number the prospect can call to test the agent'),
    ('Pay Per Close Terms', 'TEXT', 'Free setup, no contract, $50 only if job closes from the call'),
    ('A2P/TCPA Notes', 'LARGE_TEXT', 'Consent, opt-out, and compliance notes'),
]


def get_fields():
    r = requests.get(f'{base}/locations/{loc}/customFields', headers=headers, timeout=20)
    r.raise_for_status()
    return r.json().get('customFields', [])

fields = get_fields()
by_name = {f.get('name'): f for f in fields}
changes = []
errors = []

for name, dtype, placeholder in fields_to_create:
    if name in by_name:
        continue
    payload = {'name': name, 'dataType': dtype, 'placeholder': placeholder, 'model': 'contact'}
    r = requests.post(f'{base}/locations/{loc}/customFields', headers=headers, json=payload, timeout=20)
    if r.status_code in (200, 201):
        data = r.json()
        cf = data.get('customField') or data
        changes.append({'action': 'create_field', 'name': name, 'id': cf.get('id'), 'fieldKey': cf.get('fieldKey'), 'dataType': dtype})
    else:
        errors.append({'action': 'create_field', 'name': name, 'status': r.status_code, 'body': r.text[:300]})
    time.sleep(0.25)

final_fields = get_fields()
out = {
    'ok': not errors,
    'changed_at': datetime.now(timezone.utc).isoformat(),
    'location_id_set': bool(loc),
    'changes': changes,
    'errors': errors,
    'final_count': len(final_fields),
    'managed_fields': [name for name, _, _ in fields_to_create],
}
log_dir = Path('/Users/gbot/.hermes/work/hermes-review')
log_dir.mkdir(parents=True, exist_ok=True)
log_path = log_dir / f'local_services_ghl_fields_{datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")}.json'
log_path.write_text(json.dumps(out, indent=2), encoding='utf-8')
out['change_log_path'] = str(log_path)
print(json.dumps(out, indent=2))
