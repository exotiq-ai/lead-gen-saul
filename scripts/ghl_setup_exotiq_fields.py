
import json, os, sys, time
from pathlib import Path
from datetime import datetime, timezone
try:
    import requests
    from dotenv import load_dotenv
except Exception as e:
    print(json.dumps({'ok': False, 'error': str(e)})); sys.exit(1)
ROOT=Path('/Users/gbot/Projects/lead-gen-saul')
load_dotenv(ROOT/'.env.local'); load_dotenv(ROOT/'python-agent/.env')
api=os.getenv('GHL_API_KEY',''); loc=os.getenv('GHL_LOCATION_ID','')
if not api or not loc:
    print(json.dumps({'ok':False,'error':'missing GHL creds'})); sys.exit(0)
base='https://services.leadconnectorhq.com'
headers={'Authorization':f'Bearer {api}','Version':'2021-07-28','Accept':'application/json','Content-Type':'application/json'}

def get_fields():
    r=requests.get(f'{base}/locations/{loc}/customFields',headers=headers,timeout=20)
    r.raise_for_status()
    return r.json().get('customFields',[])

fields=get_fields()
by_name={f.get('name'):f for f in fields}
by_key={f.get('fieldKey'):f for f in fields}
changes=[]
errors=[]
# Rename display names, keep generated field keys intact.
renames={
    'OpenClaw Lead ID':'Exotiq Lead ID',
    'DM Draft':'Last Approved Outreach Draft',
    'DM Template Used':'Last Outreach Template Used',
}
for old,new in renames.items():
    f=by_name.get(old)
    if not f or by_name.get(new):
        continue
    payload={k:f[k] for k in ['name','dataType','placeholder','position','model'] if k in f}
    payload['name']=new
    # GHL accepts PUT for custom field updates. If it fails we leave as-is.
    url=f'{base}/locations/{loc}/customFields/{f["id"]}'
    r=requests.put(url,headers=headers,json=payload,timeout=20)
    if r.status_code in (200,201):
        changes.append({'action':'rename_field','from':old,'to':new,'id':f['id']})
    else:
        errors.append({'action':'rename_field','from':old,'to':new,'status':r.status_code,'body':r.text[:300]})
    time.sleep(0.2)
# Refresh after renames.
fields=get_fields(); by_name={f.get('name'):f for f in fields}
# Create missing additive fields for GHL as execution/tracking surface.
new_fields=[
    ('Outreach Channel','TEXT','Current/last outbound channel: instagram_dm, email, sms, phone, website_form'),
    ('Last Outreach Status','TEXT','Latest outreach state mirrored from Exotiq dashboard'),
    ('Last Outreach Sent At','TEXT','ISO timestamp for last logged/sent outreach'),
    ('IG DM Status','TEXT','allowed, blocked, sent, replied, needs_alternate_channel'),
    ('Website Contact URL','TEXT','Best contact page or form URL'),
    ('Owner Confidence','TEXT','CONFIRMED, ESTIMATED, INFERRED, UNKNOWN'),
    ('Fleet Evidence URL','TEXT','Source URL supporting fleet size / vehicle evidence'),
    ('Marketplace Fit Tier','TEXT','Founding operator marketplace fit tier'),
    ('Insurance Readiness Notes','LARGE_TEXT','Insurance/infrastructure notes for call prep'),
    ('Approved Copy Source','TEXT','Canonical source for approved copy, usually Supabase outreach_queue.message_draft'),
]
for name,dtype,placeholder in new_fields:
    if name in by_name:
        continue
    payload={'name':name,'dataType':dtype,'placeholder':placeholder,'model':'contact'}
    r=requests.post(f'{base}/locations/{loc}/customFields',headers=headers,json=payload,timeout=20)
    if r.status_code in (200,201):
        data=r.json()
        cf=data.get('customField') or data
        changes.append({'action':'create_field','name':name,'id':cf.get('id'),'fieldKey':cf.get('fieldKey'),'dataType':dtype})
    else:
        errors.append({'action':'create_field','name':name,'status':r.status_code,'body':r.text[:300]})
    time.sleep(0.25)
# Final backup summary.
final_fields=get_fields()
out={'ok': not errors, 'changed_at': datetime.now(timezone.utc).isoformat(), 'changes': changes, 'errors': errors, 'final_count': len(final_fields), 'final_fields': [{'id':f.get('id'),'name':f.get('name'),'fieldKey':f.get('fieldKey'),'dataType':f.get('dataType')} for f in final_fields]}
path=Path('/Users/gbot/.hermes/work/hermes-review')/f'exotiq_ghl_setup_changes_{datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")}.json'
path.write_text(json.dumps(out,indent=2),encoding='utf-8')
out['change_log_path']=str(path)
print(json.dumps(out,indent=2))
