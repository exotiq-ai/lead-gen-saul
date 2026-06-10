#!/usr/bin/env python3
from __future__ import annotations
import json, os, re
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

ROOT = Path('/Users/gbot/Projects/lead-gen-saul')
load_dotenv(ROOT/'.env.local'); load_dotenv(ROOT/'python-agent/.env')
TENANT='00000000-0000-0000-0000-000000000001'
PHONE_RE = re.compile(r'(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}')

def normalize_phone(s: str) -> str | None:
    digits = re.sub(r'\D+', '', s or '')
    if len(digits) == 11 and digits.startswith('1'):
        digits = digits[1:]
    if len(digits) != 10:
        return None
    return f'({digits[:3]}) {digits[3:6]}-{digits[6:]}'

def main(live=False):
    s=create_client(os.environ['NEXT_PUBLIC_SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
    rows=s.table('leads').select('id,company_name,phone,score_breakdown').eq('tenant_id',TENANT).limit(1000).execute().data or []
    updates=[]
    for r in rows:
        if r.get('phone'): continue
        txt=json.dumps(r.get('score_breakdown') or {}, ensure_ascii=False)
        for m in PHONE_RE.finditer(txt):
            phone=normalize_phone(m.group(0))
            if phone:
                updates.append({'id':r['id'], 'company_name':r['company_name'], 'phone':phone, 'raw':m.group(0)})
                break
    out=[]
    now=datetime.now(timezone.utc).isoformat()
    for u in updates:
        item={**u, 'updated': False}
        if live:
            s.table('leads').update({'phone': u['phone'], 'updated_at': now}).eq('id',u['id']).eq('tenant_id',TENANT).execute()
            item['updated']=True
        out.append(item)
    outdir=Path('/Users/gbot/.hermes/work/exotiq-enrichment'); outdir.mkdir(parents=True, exist_ok=True)
    path=outdir/f'phone_recovery_from_existing_metadata_{datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")}.json'
    path.write_text(json.dumps({'live':live,'count':len(out),'updates':out},indent=2),encoding='utf-8')
    print(json.dumps({'live':live,'count':len(out),'path':str(path),'updates':out},indent=2))
if __name__=='__main__':
    import sys
    main('--live' in sys.argv)
