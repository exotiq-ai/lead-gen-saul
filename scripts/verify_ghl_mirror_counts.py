
import os,json
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client
ROOT=Path('/Users/gbot/Projects/lead-gen-saul'); load_dotenv(ROOT/'.env.local'); load_dotenv(ROOT/'python-agent/.env')
s=create_client(os.environ['NEXT_PUBLIC_SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
tenant='00000000-0000-0000-0000-000000000001'
rows=s.table('outreach_queue').select('id,status,lead_id,leads(ghl_contact_id)').eq('tenant_id',tenant).eq('status','approved').limit(500).execute().data or []
with_id=0
for r in rows:
    l=r.get('leads') or {}
    if l.get('ghl_contact_id'): with_id+=1
print(json.dumps({'approved_queue':len(rows),'approved_with_ghl_contact_id':with_id,'approved_missing_ghl_contact_id':len(rows)-with_id}, indent=2))
