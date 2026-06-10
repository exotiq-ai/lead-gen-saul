#!/usr/bin/env python3
from __future__ import annotations
"""Nationwide Exotiq no-Apollo lead discovery/enrichment push.

Searches DuckDuckGo HTML for exotic/luxury rental operators, enriches from
public websites/contact pages, dedups against Supabase, inserts qualified leads,
and generates approved outreach drafts through the existing drafting skill.

No Apollo. No outreach sending. Safe pacing.
"""
import argparse, csv, html, json, os, random, re, sys, time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, quote_plus, unquote, urljoin, urlparse

import requests
from dotenv import load_dotenv
from supabase import create_client

ROOT = Path('/Users/gbot/Projects/lead-gen-saul')
sys.path.insert(0, str(ROOT/'python-agent'))
from skills.draft import draft_outreach  # noqa: E402

load_dotenv(ROOT/'.env.local'); load_dotenv(ROOT/'python-agent/.env')
TENANT='00000000-0000-0000-0000-000000000001'
OUTDIR=Path('/Users/gbot/.hermes/work/exotiq-lead-push'); OUTDIR.mkdir(parents=True, exist_ok=True)

UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36'
EXCLUDE_TERMS={
 'turo','enterprise','hertz','avis','budget','sixt','thrifty','dollar','kayak','expedia','tripadvisor','yelp','facebook','youtube','wikipedia','linkedin','indeed','ziprecruiter','glassdoor','cars.com','autotrader','edmunds','realtor','zillow','reddit','pinterest','instagram.com/p/', 'instagram.com/reel', 'booking.com', 'cloud of goods', 'cloudofgoods', 'giggster', 'getaround', 'friendwitha', 'car rental list', 'carrentallist'
}
EXCLUDE_DOMAINS={'turo.com','enterprise.com','hertz.com','avis.com','budget.com','sixt.com','kayak.com','expedia.com','tripadvisor.com','yelp.com','facebook.com','youtube.com','wikipedia.org','linkedin.com','indeed.com','glassdoor.com','cars.com','autotrader.com','edmunds.com','reddit.com','pinterest.com','cloudofgoods.com','giggster.com','getaround.com','friendwitha.com','duckduckgo.com','carrentallist.com'}
PHONE_RE=re.compile(r'(?:\+?1[\s.\-]?)?(?:\(\d{3}\)|\d{3})[\s.\-]?\d{3}[\s.\-]?\d{4}')
EMAIL_RE=re.compile(r'(?i)\b[A-Z0-9._%+\-]+@([A-Z0-9.\-]+\.[A-Z]{2,})\b')
IG_RE=re.compile(r'https?://(?:www\.)?instagram\.com/([A-Za-z0-9_.]{2,30})/?', re.I)
FLEET_RE=re.compile(r'(?i)(\d{1,3})\+?\s*(?:exotic|luxury|premium|high[-\s]?end|super)?\s*(?:cars|vehicles|fleet|inventory)')
BAD_EMAIL_PREFIX=('info@wix','support@wix','privacy@','abuse@','domain@','webmaster@')

MARKETS = [
 'Miami FL','Fort Lauderdale FL','West Palm Beach FL','Orlando FL','Tampa FL','Jacksonville FL',
 'Atlanta GA','Dallas TX','Fort Worth TX','Houston TX','Austin TX','San Antonio TX',
 'Las Vegas NV','Los Angeles CA','Orange County CA','San Diego CA','San Francisco CA','San Jose CA','Sacramento CA',
 'Scottsdale AZ','Phoenix AZ','Denver CO','Boulder CO','Aspen CO','Vail CO',
 'New York NY','Long Island NY','New Jersey','Philadelphia PA','Washington DC','Baltimore MD','Boston MA',
 'Chicago IL','Detroit MI','Columbus OH','Cleveland OH','Nashville TN','Charlotte NC','Raleigh NC',
 'Seattle WA','Portland OR','Salt Lake City UT','New Orleans LA','Minneapolis MN','St Louis MO','Kansas City MO'
]
QUERY_TEMPLATES = [
 'exotic car rental {market}',
 'luxury car rental {market}',
 'supercar rental {market}',
 'lamborghini rental {market}',
 'ferrari rental {market}',
 'rolls royce rental {market}',
 'exotic rental cars {market}',
]
CONTACT_PATHS=['/contact','/contact-us','/about','/about-us','/fleet','/inventory','/cars','/rentals']

@dataclass
class Candidate:
    company_name: str
    url: str
    domain: str
    market: str
    title: str = ''
    snippet: str = ''
    phone: str | None = None
    email: str | None = None
    ig_handle: str | None = None
    fleet_size: int | None = None
    google_rating: float | None = None
    google_reviews: int | None = None
    score: int = 40
    reasons: list[str] = None
    status: str = 'candidate'
    inserted_id: str | None = None
    skip_reason: str | None = None


def norm_domain(url):
    try:
        d=urlparse(url).netloc.lower().split('@')[-1]
        if d.startswith('www.'): d=d[4:]
        return d
    except Exception: return ''

def clean_url(u):
    u=html.unescape(u)
    if 'uddg=' in u:
        qs=parse_qs(urlparse(u).query)
        if qs.get('uddg'): u=unquote(qs['uddg'][0])
    if u.startswith('//'): u='https:'+u
    return u.split('&rut=')[0]

def normalize_phone(raw):
    digits=re.sub(r'\D+','',raw or '')
    if len(digits)==11 and digits.startswith('1'): digits=digits[1:]
    if len(digits)!=10: return None
    if digits.startswith(('000','111','123','555')): return None
    return f'({digits[:3]}) {digits[3:6]}-{digits[6:]}'

def company_from_domain(domain):
    base=(domain or '').split('.')[0]
    known={
        'lvcexotics':'LVC Exotics', '777exotics':'777 Exotics', 'vegasluxuryrides':'Vegas Luxury Rides',
        'exoticcarrentalsandiego':'Exotic Car Rental San Diego', 'rentxotic':'RentXotic',
        'sandiegoprestige':'San Diego Prestige', 'premierautosandiego':'Premier Auto San Diego',
        'mvpcharlotte':'MVP Charlotte', 'sdlambo':'SD Lamborghini',
    }
    if base in known: return known[base]
    # split common compact names: keep numbers, title words roughly
    s=re.sub(r'(?i)(exotics|exotic|luxury|rides|rentals|rental|cars|auto|autos|club|motors)', r' \1 ', base)
    s=re.sub(r'[-_]+',' ',s)
    s=re.sub(r'\s+',' ',s).strip().title()
    return s or domain

def company_from_title(title, domain):
    t=html.unescape(re.sub(r'<[^>]+>',' ',title or ''))
    t=re.sub(r'\s+',' ',t).strip()
    t=re.split(r'\s[-|–—:]\s|\|',t)[0].strip()
    t=re.sub(r'(?i)\b(exotic car rental|luxury car rental|supercar rental|rentals?|cars?)\b.*$','',t).strip(' -|:')
    generic_locations={'las vegas','miami','los angeles','new york','orlando','atlanta','dallas','houston','scottsdale','phoenix','denver','luxury','ferrari','lamborghini','mclaren','rolls royce','home'}
    generic_prefix=re.match(r'(?i)^(#?1\s+)?(luxury|sports|exotic|ferrari|lamborghini|mclaren|rolls royce|san diego|las vegas)(\b|,|\s*&)', t or '')
    if not t or len(t)<3 or t.lower() in generic_locations or generic_prefix or re.match(r'(?i)^(las vegas|miami|luxury|exotic)$', t):
        t=company_from_domain(domain)
    return t[:120]

def is_bad(url,title=''):
    low=(url+' '+title).lower()
    d=norm_domain(url)
    if any(x in low for x in EXCLUDE_TERMS): return True
    if d in EXCLUDE_DOMAINS: return True
    if not d or '.' not in d: return True
    return False

def search_ddg(query, max_results=10):
    try:
        r=requests.get('https://html.duckduckgo.com/html/', params={'q':query}, headers={'User-Agent':UA}, timeout=20)
        text=r.text
    except Exception:
        return []
    out=[]
    # result blocks vary; capture anchors and snippets roughly
    for m in re.finditer(r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>', text, re.S):
        url=clean_url(m.group(1)); title=re.sub(r'<[^>]+>',' ',m.group(2)); title=re.sub(r'\s+',' ',html.unescape(title)).strip()
        if not url.startswith('http') or is_bad(url,title): continue
        start=max(0,m.start()-800); end=min(len(text),m.end()+1200)
        block=text[start:end]
        sn=re.sub(r'<[^>]+>',' ',block); sn=re.sub(r'\s+',' ',html.unescape(sn)).strip()[:500]
        out.append({'url':url,'title':title,'snippet':sn})
        if len(out)>=max_results: break
    return out

def fetch_url(url):
    try:
        r=requests.get(url, headers={'User-Agent':UA}, timeout=12, allow_redirects=True)
        ct=r.headers.get('content-type','')
        if r.status_code>=400 or ('text/html' not in ct and 'text/plain' not in ct and ct): return ''
        return r.text[:300000]
    except Exception:
        return ''

def strip_text(s):
    s=re.sub(r'(?is)<(script|style|noscript).*?</\1>',' ',s)
    s=re.sub(r'(?i)<br\s*/?>','\n',s)
    s=re.sub(r'<[^>]+>',' ',s)
    return re.sub(r'\s+',' ',html.unescape(s)).strip()

def first_good_email(text, domain):
    emails=[]
    for m in EMAIL_RE.finditer(text):
        e=m.group(0).lower().strip('.;,')
        if any(e.startswith(p) for p in BAD_EMAIL_PREFIX): continue
        if any(x in e for x in ['example.com','sentry.io','schema.org']): continue
        score=0
        if domain and e.endswith('@'+domain): score+=10
        if e.startswith(('info@','hello@','rentals@','booking@','reservations@','sales@','contact@')): score+=5
        emails.append((score,e))
    return sorted(set(emails), reverse=True)[0][1] if emails else None

def enrich_candidate(c: Candidate):
    blobs=[c.title,c.snippet]
    html_home=fetch_url(c.url)
    blobs.append(html_home)
    # collect internal links for contact/fleet pages
    links=set()
    for href in re.findall(r'(?i)href=["\']([^"\']+)', html_home or ''):
        full=urljoin(c.url, html.unescape(href))
        if norm_domain(full)==c.domain and any(p in urlparse(full).path.lower() for p in ['contact','about','fleet','inventory','cars','rental']):
            links.add(full.split('#')[0])
    for p in CONTACT_PATHS:
        links.add(urljoin(f'https://{c.domain}', p))
    for link in list(links)[:5]:
        time.sleep(0.15)
        blobs.append(fetch_url(link))
    raw='\n'.join(x for x in blobs if x)
    text=strip_text(raw)
    # phone
    for m in PHONE_RE.finditer(text):
        ph=normalize_phone(m.group(0))
        if ph: c.phone=ph; break
    c.email=first_good_email(text, c.domain)
    igs=[]
    for m in IG_RE.finditer(raw):
        h=m.group(1).strip('.').lower()
        if h not in ('p','reel','explore','accounts'): igs.append(h)
    if igs: c.ig_handle='@'+igs[0]
    # fleet size
    fleet_vals=[]
    for m in FLEET_RE.finditer(text):
        try:
            n=int(m.group(1))
            if 2<=n<=300: fleet_vals.append(n)
        except Exception: pass
    if fleet_vals: c.fleet_size=max(fleet_vals)
    # parse snippets for google-like review/rating when present
    m=re.search(r'([1-5]\.[0-9])\s*(?:stars?|rating)?\s*(?:\(|-|,)?\s*([0-9,]{2,5})\s*(?:reviews?)', c.snippet, re.I)
    if m:
        try: c.google_rating=float(m.group(1)); c.google_reviews=int(m.group(2).replace(',',''))
        except Exception: pass
    score=40; reasons=[]
    low=(text+' '+c.title+' '+c.snippet).lower()
    if any(w in low for w in ['exotic','supercar','lamborghini','ferrari','mclaren','rolls royce','bentley']): score+=15; reasons.append('exotic/luxury keyword fit')
    if c.phone: score+=10; reasons.append('phone found')
    if c.email: score+=5; reasons.append('email found')
    if c.ig_handle: score+=8; reasons.append('instagram found')
    if c.fleet_size:
        if c.fleet_size>=25: score+=30; reasons.append(f'fleet evidence {c.fleet_size}+ vehicles')
        elif c.fleet_size>=15: score+=22; reasons.append(f'fleet evidence {c.fleet_size}+ vehicles')
        elif c.fleet_size>=8: score+=15; reasons.append(f'fleet evidence {c.fleet_size}+ vehicles')
        elif c.fleet_size>=5: score+=8; reasons.append(f'fleet evidence {c.fleet_size}+ vehicles')
    if c.google_reviews and c.google_reviews>=100: score+=8; reasons.append(f'{c.google_reviews} reviews signal')
    if any(x in low for x in ['turo','enterprise','hertz','sixt']): score-=30; reasons.append('possible marketplace/corporate noise')
    c.score=max(0,min(100,score)); c.reasons=reasons
    return c

def existing_sets(s):
    rows=s.table('leads').select('company_name,company_domain,email,phone,score_breakdown').eq('tenant_id',TENANT).limit(5000).execute().data or []
    names={re.sub(r'\W+','', (r.get('company_name') or '').lower()) for r in rows if r.get('company_name')}
    domains={norm_domain('https://'+(r.get('company_domain') or '')) for r in rows if r.get('company_domain')}
    emails={(r.get('email') or '').lower() for r in rows if r.get('email')}
    phones={normalize_phone(r.get('phone') or '') for r in rows if r.get('phone')}
    phones={p for p in phones if p}
    for r in rows:
        sb=r.get('score_breakdown') or {}
        for key in ['website','company_website','source_url']:
            if sb.get(key): domains.add(norm_domain(sb[key]))
    return names,domains,emails,phones

def insert_candidate(s,c:Candidate, dry_run=False):
    now=datetime.now(timezone.utc).isoformat()
    score_breakdown={
        'composite': c.score,
        'icp_fit': c.score,
        'exotiq_tier': 5 if c.score>=90 else 4 if c.score>=75 else 3 if c.score>=60 else 2,
        'fleet_size': c.fleet_size,
        'fleet_raw': c.fleet_size,
        'online_presence': 80 if c.ig_handle and c.email else 65 if c.ig_handle or c.email else 45,
        'company_ig_handle': c.ig_handle,
        'company_google_rating': c.google_rating,
        'company_google_reviews': c.google_reviews,
        'website': c.url,
        'source_url': c.url,
        'enrichment_sources': ['duckduckgo_search','public_website_scrape'],
        'scoring_rationale': '; '.join(c.reasons or []) + f'. Source: {c.url}',
        'phone_confidence': 'public_website_or_search' if c.phone else None,
        'email_confidence': 'public_website_or_search' if c.email else None,
    }
    row={
        'tenant_id': TENANT,
        'company_name': c.company_name,
        'company_domain': c.domain,
        'company_location': c.market,
        'email': c.email,
        'phone': c.phone,
        'source': 'outbound',
        'source_detail': f'nationwide_web_push:{datetime.now(timezone.utc).strftime("%Y%m%d")}',
        'status': 'scored' if c.score>=55 else 'new',
        'score': c.score,
        'icp_fit_score': c.score,
        'score_breakdown': score_breakdown,
        'assigned_to': 'gregory' if c.score>=90 else 'team',
        'created_at': now,
        'updated_at': now,
    }
    if dry_run: return None
    res=s.table('leads').insert(row).execute()
    data=res.data or []
    return data[0].get('id') if data else None

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--duration-minutes', type=int, default=60)
    ap.add_argument('--max-insert', type=int, default=100)
    ap.add_argument('--min-score', type=int, default=55)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--markets', default='')
    args=ap.parse_args()
    s=create_client(os.environ['NEXT_PUBLIC_SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
    names,domains,emails,phones=existing_sets(s)
    markets=[m.strip() for m in args.markets.split('|') if m.strip()] or MARKETS
    queries=[qt.format(market=m) for m in markets for qt in QUERY_TEMPLATES]
    random.shuffle(queries)
    start=time.time(); inserted=[]; candidates=[]; skipped=[]; searched=0
    log_path=OUTDIR/f'nationwide_push_{datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")}.jsonl'
    with log_path.open('w',encoding='utf-8') as log:
        for query in queries:
            if time.time()-start > args.duration_minutes*60 or len(inserted)>=args.max_insert: break
            searched+=1
            market=' '.join(query.split()[-2:])
            results=search_ddg(query, max_results=8)
            log.write(json.dumps({'event':'search','query':query,'results':len(results),'ts':datetime.now(timezone.utc).isoformat()})+'\n'); log.flush()
            for r in results:
                if time.time()-start > args.duration_minutes*60 or len(inserted)>=args.max_insert: break
                url=r['url']; d=norm_domain(url)
                nm=company_from_title(r.get('title',''), d); nk=re.sub(r'\W+','',nm.lower())
                if d in domains or nk in names:
                    skipped.append({'company':nm,'domain':d,'reason':'duplicate'}); continue
                c=Candidate(company_name=nm,url=url,domain=d,market=query.replace('exotic car rental','').replace('luxury car rental','').strip(),title=r.get('title',''),snippet=r.get('snippet',''))
                try: enrich_candidate(c)
                except Exception as e: c.skip_reason=f'enrich_error:{e}'
                candidates.append(asdict(c))
                if c.skip_reason or c.score<args.min_score or not any([c.phone,c.email,c.ig_handle]):
                    skipped.append({'company':c.company_name,'domain':c.domain,'score':c.score,'reason':c.skip_reason or 'below_threshold_or_no_contact'}); continue
                # Slingshot-only businesses are usually not our highest-converting ICP.
                text_gate=(c.company_name+' '+c.title+' '+c.snippet).lower()
                if 'slingshot' in text_gate and not any(x in text_gate for x in ['lamborghini','ferrari','mclaren','rolls','bentley','exotic car','luxury car']):
                    skipped.append({'company':c.company_name,'domain':c.domain,'score':c.score,'reason':'slingshot_only_low_icp'}); continue
                # dedup by newly found contact data too
                if (c.email and c.email.lower() in emails) or (c.phone and c.phone in phones):
                    skipped.append({'company':c.company_name,'domain':c.domain,'score':c.score,'reason':'duplicate_contact'}); continue
                try:
                    lid=insert_candidate(s,c,dry_run=args.dry_run); c.inserted_id=lid; c.status='inserted' if lid or args.dry_run else 'insert_failed'
                    inserted.append(asdict(c)); domains.add(d); names.add(nk)
                    if c.email: emails.add(c.email.lower())
                    if c.phone: phones.add(c.phone)
                    log.write(json.dumps({'event':'inserted','candidate':asdict(c),'ts':datetime.now(timezone.utc).isoformat()})+'\n'); log.flush()
                except Exception as e:
                    skipped.append({'company':c.company_name,'domain':c.domain,'score':c.score,'reason':f'insert_error:{e}'})
                time.sleep(random.uniform(0.4,1.2))
            time.sleep(random.uniform(1.8,4.0))
    draft_result={}
    if inserted and not args.dry_run:
        try:
            draft_result=draft_outreach(tenant_id=TENANT, batch_size=min(200, max(25,len(inserted)+20)))
        except Exception as e:
            draft_result={'error':repr(e)}
    summary={'duration_sec':round(time.time()-start,1),'queries_searched':searched,'inserted_count':len(inserted),'candidate_count':len(candidates),'skipped_count':len(skipped),'log_path':str(log_path),'draft_result':draft_result,'inserted':inserted,'top_skipped':skipped[:200]}
    summary_path=OUTDIR/f'nationwide_push_summary_{datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")}.json'
    summary_path.write_text(json.dumps(summary,indent=2,ensure_ascii=False),encoding='utf-8')
    # CSV of inserted
    csv_path=OUTDIR/f'nationwide_push_inserted_{datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")}.csv'
    with csv_path.open('w',newline='',encoding='utf-8') as f:
        fieldnames=['company_name','market','score','phone','email','ig_handle','fleet_size','domain','url','reasons','inserted_id']
        w=csv.DictWriter(f, fieldnames=fieldnames); w.writeheader()
        for c in inserted:
            w.writerow({k: c.get(k) for k in fieldnames})
    print(json.dumps({k:summary[k] for k in ['duration_sec','queries_searched','inserted_count','candidate_count','skipped_count','log_path','draft_result']} | {'summary_path':str(summary_path),'csv_path':str(csv_path)}, indent=2))
if __name__=='__main__': main()
