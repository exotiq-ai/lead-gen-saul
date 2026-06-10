#!/usr/bin/env python3
from __future__ import annotations
import csv, json, os, re
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

ROOT=Path('/Users/gbot/Projects/lead-gen-saul')
load_dotenv(ROOT/'.env.local'); load_dotenv(ROOT/'python-agent/.env')
TENANT='00000000-0000-0000-0000-000000000001'
OUTDIR=Path('/Users/gbot/.hermes/work/exotiq-enrichment'); OUTDIR.mkdir(parents=True, exist_ok=True)

def ig_handle(r):
    sb=r.get('score_breakdown') or {}
    return sb.get('company_ig_handle') or sb.get('ig_handle') or ''

def rationale(r):
    return (r.get('score_breakdown') or {}).get('scoring_rationale') or ''

def fleet(r):
    sb=r.get('score_breakdown') or {}
    return sb.get('fleet_size') or sb.get('fleet_raw') or ''

def owner_route(r):
    score=r.get('score') or 0
    if score>=100: return 'Gregory only, phone first'
    if score>=80: return 'High priority, phone/email'
    if score>=60: return 'Standard outreach, phone if clean'
    return 'Nurture/hold unless special signal'

def pain_angle(r):
    text=(rationale(r)+' '+json.dumps(r.get('score_breakdown') or {})).lower()
    angles=[]
    if 'multi' in text or 'location' in text: angles.append('multi-location coordination')
    if 'turo' in text: angles.append('direct bookings away from Turo')
    if 'chauffeur' in text or 'yacht' in text: angles.append('complex inventory / service mix')
    if 'miami' in (r.get('company_location') or '').lower(): angles.append('Miami demand spikes / events')
    if not angles: angles.append('manual bookings, pricing, fleet ops')
    return '; '.join(angles[:2])

def opener(r):
    company=r.get('company_name') or 'your company'
    market=r.get('company_location') or 'your market'
    f=fleet(r)
    proof=f"looks like you have around {f} cars" if f else 'I saw the fleet and local presence'
    return f"Hey, this is Gregory Ringler with Exotiq. I came across {company} in {market}. {proof}. Quick question, are you still handling most bookings through texts/DMs, or do you have a system you like?"

def main():
    s=create_client(os.environ['NEXT_PUBLIC_SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
    rows=s.table('leads').select('id,company_name,company_location,email,phone,score,status,score_breakdown,ghl_contact_id,updated_at').eq('tenant_id',TENANT).limit(1000).execute().data or []
    rows=sorted(rows, key=lambda r: (0 if r.get('phone') else 1, -(r.get('score') or 0), r.get('company_name') or ''))
    ts=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    csv_path=OUTDIR/f'exotiq_monday_call_list_{ts}.csv'
    md_path=OUTDIR/f'exotiq_monday_call_sheet_{ts}.md'
    fields=['priority','company','market','phone','email','score','fleet_est','ig','route','pain_angle','opener','rationale','ghl_contact_id']
    callable_rows=[r for r in rows if r.get('phone') and (r.get('score') or 0)>=60]
    with csv_path.open('w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f,fieldnames=fields); w.writeheader()
        for i,r in enumerate(callable_rows,1):
            w.writerow({'priority':i,'company':r.get('company_name'),'market':r.get('company_location'),'phone':r.get('phone'),'email':r.get('email'),'score':r.get('score'),'fleet_est':fleet(r),'ig':ig_handle(r),'route':owner_route(r),'pain_angle':pain_angle(r),'opener':opener(r),'rationale':rationale(r),'ghl_contact_id':r.get('ghl_contact_id')})
    lines=['# Exotiq Monday Call Sheet','',f'Generated: {datetime.now(timezone.utc).isoformat()}','',f'Callable score >=60 leads with phone: {len(callable_rows)}','']
    for i,r in enumerate(callable_rows[:35],1):
        lines += [f'## {i}. {r.get("company_name")}','',f'- Score: {r.get("score")}',f'- Market: {r.get("company_location")}',f'- Phone: {r.get("phone")}',f'- Email: {r.get("email") or ""}',f'- Fleet est: {fleet(r)}',f'- IG: {ig_handle(r)}',f'- Route: {owner_route(r)}',f'- Pain angle: {pain_angle(r)}',f'- Opener: {opener(r)}',f'- Evidence: {rationale(r)}','']
    md_path.write_text('\n'.join(lines),encoding='utf-8')
    missing_phone=sum(1 for r in rows if not r.get('phone'))
    print(json.dumps({'total_leads':len(rows),'callable_score_60_plus_with_phone':len(callable_rows),'missing_phone':missing_phone,'csv_path':str(csv_path),'md_path':str(md_path)},indent=2))
if __name__=='__main__': main()
