"""Reviewed evidence → Exotiq leads, without drafts, sends or CRM mirroring.

Dry plan: python3 scripts/import_sales_trip.py --input reviewed.json --output plan.json
Apply:   python3 scripts/import_sales_trip.py --apply plan.json --receipt receipt.json
Credentials are read from --env-file, never printed. Backups remain in the private plan.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import uuid
from pathlib import Path
from urllib.parse import urlparse

TENANT = '00000000-0000-0000-0000-000000000001'
TRIP = 'denver-miami-2026'
KEY = 'road_trip_2026'
BLOCKED = {'wrong_icp', 'competitor', 'duplicate', 'unsubscribed', 'negative_reply', 'do_not_contact'}


def domain(value):
    if not isinstance(value, str) or not value.strip():
        return ''
    text = value.strip().lower()
    return (urlparse(text if '://' in text else 'https://' + text).hostname or '').removeprefix('www.')


def digits(value):
    result = re.sub(r'\D', '', value or '')
    return result[-10:] if len(result) in [10, 11] else ''


def normalized(value):
    return re.sub(r'[^a-z0-9]', '', (value or '').lower())


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def blocked(row):
    flags = {f if isinstance(f, str) else f.get('code') for f in row.get('red_flags', []) or []}
    return row.get('status') in ['converted', 'lost', 'disqualified'] or bool(flags & BLOCKED)


def place_ids(row):
    sb = row.get('score_breakdown') or {}
    return {value for value in [sb.get('google_place_id'), ((sb.get(KEY) or {}).get('google') or {}).get('place_id')] if value}


def identity_matches(rec, rows):
    place = (rec.get('google') or {}).get('place_id')
    website = domain(rec.get('website'))
    phone = digits(rec.get('phone'))
    name = normalized(rec.get('company_name'))
    email = (rec.get('email') or '').lower()
    matches = []
    for row in rows:
        sb = row.get('score_breakdown') or {}
        row_domain = domain(row.get('company_domain') or sb.get('website') or sb.get('company_website'))
        if ((place and place in place_ids(row)) or (website and website == row_domain) or (phone and phone == digits(row.get('phone')))
                or (email and email == (row.get('email') or '').lower())
                or (name and name == normalized(row.get('company_name')))):
            matches.append(row)
    # Keep the complete set: canonical preference must never hide suppression.
    return matches


def plan_records(records, existing):
    plan = {'trip_id': TRIP, 'tenant_id': TENANT, 'operations': [], 'held': [], 'unchanged': []}
    seen = set()
    seen_targets = set()
    planned_creates = []
    for raw in records:
        rec = copy.deepcopy(raw)
        company = rec.get('company_name', 'Unknown')
        rec['trip_id'] = TRIP
        if not rec.get('source_urls') or not rec.get('checked_at'):
            plan['held'].append({'company': company, 'reason': 'missing source evidence or capture date'})
            continue
        if (rec.get('icp') or {}).get('self_drive') is not True:
            plan['held'].append({'company': company, 'reason': 'self-drive fit not confirmed'})
            continue
        identity = '|'.join([domain(rec.get('website')) or normalized(company), normalized(rec.get('city'))])
        place = (rec.get('google') or {}).get('place_id')
        tokens = {'identity:' + identity}
        if place:
            tokens.add('place:' + place)
        # Contact guards coexist with place identity so partially enriched aliases
        # cannot create a second row. Shared-contact branches require review.
        if domain(rec.get('website')) and digits(rec.get('phone')):
            tokens.add('contact:' + domain(rec['website']) + ':' + digits(rec['phone']))
        if tokens & seen:
            plan['held'].append({'company': company, 'reason': 'duplicate input identity'})
            continue
        seen.update(tokens)
        if identity_matches(rec, planned_creates):
            plan['held'].append({'company': company, 'reason': 'identity overlaps an earlier planned creation; review aliases or branches'})
            continue
        matches = identity_matches(rec, existing)
        if any(blocked(row) for row in matches):
            plan['held'].append({'company': company, 'reason': 'preserved suppressed or converted identity match', 'ids': [row['id'] for row in matches if blocked(row)]})
            continue
        reviewed_id = rec.get('reviewed_canonical_lead_id')
        if reviewed_id:
            selected = [row for row in matches if row['id'] == reviewed_id]
            if len(selected) != 1 or not rec.get('reviewed_canonical_reason') or any(blocked(row) for row in matches):
                plan['held'].append({'company': company, 'reason': 'reviewed canonical mapping invalid or suppressed'})
                continue
            prior_related = (((selected[0].get('score_breakdown') or {}).get(KEY) or {}).get('related_existing_lead_ids') or [])
            rec['related_existing_lead_ids'] = sorted(set(prior_related + [row['id'] for row in matches if row['id'] != reviewed_id]))
            matches = selected
        elif place:
            exact_places = [row for row in matches if place in place_ids(row)]
            if len(exact_places) == 1:
                matches = exact_places
        if len(matches) > 1:
            plan['held'].append({'company': company, 'reason': 'ambiguous canonical identity', 'ids': [r['id'] for r in matches]})
            continue
        old = matches[0] if matches else None
        if old:
            if old['id'] in seen_targets:
                plan['held'].append({'company': company, 'reason': 'canonical target repeated in input', 'id': old['id']})
                continue
            seen_targets.add(old['id'])
        visible_count = (rec.get('icp') or {}).get('fleet_min_visible')
        if not old and isinstance(visible_count, (int, float)) and visible_count < 5:
            plan['held'].append({'company': company, 'reason': 'new candidate below verified fleet minimum'})
            continue
        if old and blocked(old):
            plan['held'].append({'company': company, 'reason': 'preserved suppressed or converted record', 'id': old['id']})
            continue
        sb = copy.deepcopy((old or {}).get('score_breakdown') or {})
        patch = {}
        if old and reviewed_id and rec.get('reviewed_company_name') and old.get('company_name') != rec['reviewed_company_name']:
            patch['company_name'] = rec['reviewed_company_name']
            sb.setdefault('previous_company_name', old.get('company_name'))
        conflicts = copy.deepcopy((sb.get(KEY) or {}).get('contact_conflicts') or {})
        for key, value in [('phone', rec.get('phone')), ('email', rec.get('email')), ('company_domain', domain(rec.get('website')))]:
            current = (old or {}).get(key)
            if value and (not current or (key == 'phone' and not digits(current))):
                patch[key] = value
                if current:
                    conflicts[key] = {'existing': current, 'researched': value, 'resolution': 'invalid legacy phone corrected from reviewed public source'}
            elif value and current:
                compare = digits if key == 'phone' else domain if key == 'company_domain' else lambda v: v.lower()
                if compare(value) != compare(current):
                    conflicts[key] = {'existing': current, 'researched': value, 'resolution': 'preserved existing; review before use'}
        if conflicts:
            rec['contact_conflicts'] = conflicts
        owner = rec.get('owner') or {}
        if owner.get('name') and str(owner.get('confidence')).lower() in ['confirmed', 'high'] and re.search(r'owner|founder', owner.get('role') or '', re.I):
            if not (old or {}).get('first_name') and not (old or {}).get('last_name'):
                names = owner['name'].strip().split(' ', 1)
                patch['first_name'] = names[0]
                patch['last_name'] = names[1] if len(names) > 1 else None
        if not old:
            sb.update({'outreach_hold': True, 'outreach_hold_reason': 'Trip research only. No outbound authorized.',
                       'score_method': 'unscored_research_only'})
        if old and sb.get(KEY) == rec and not patch:
            plan['unchanged'].append({'company': company, 'id': old['id']})
            continue
        sb[KEY] = rec
        # Reuse established display keys only where absent; trip evidence retains
        # current observations and conflicts without rewriting historic scoring.
        display_fields = {
            'website': rec.get('website'),
            'company_ig_handle': (rec.get('instagram') or {}).get('handle'),
            'google_place_id': (rec.get('google') or {}).get('place_id'),
            'company_google_rating': (rec.get('google') or {}).get('rating'),
            'company_google_reviews': (rec.get('google') or {}).get('review_count'),
            'fleet_visible_listing_count': (rec.get('icp') or {}).get('fleet_min_visible'),
        }
        for key, value in display_fields.items():
            if sb.get(key) in [None, ''] and value is not None:
                sb[key] = value
        patch['score_breakdown'] = sb
        if old:
            plan['operations'].append({'method': 'PATCH', 'id': old['id'], 'company': company,
                                       'before': old, 'payload': patch})
        else:
            new_id = str(uuid.uuid5(uuid.NAMESPACE_URL, TRIP + ':' + identity))
            patch.update({'id': new_id, 'tenant_id': TENANT, 'company_name': company,
                          'company_location': ', '.join(filter(None, [rec.get('city'), rec.get('state')])),
                          'company_industry': 'Luxury/exotic self-drive rental', 'source': 'manual',
                          'source_detail': TRIP + ':' + identity, 'status': 'new', 'score': 0,
                          'red_flags': []})
            plan['operations'].append({'method': 'POST', 'id': new_id, 'company': company,
                                       'before': None, 'payload': patch})
            planned_creates.append(copy.deepcopy(patch))
    return plan


def private_write(path, value):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(value, indent=2, ensure_ascii=False))
    p.chmod(0o600)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input')
    parser.add_argument('--output')
    parser.add_argument('--apply')
    parser.add_argument('--receipt')
    parser.add_argument('--env-file', default='/Users/gbot/Projects/lead-gen-saul/.env.local')
    args = parser.parse_args()
    if not ((args.input and args.output and not args.apply) or (args.apply and args.receipt and not args.input)):
        parser.error('use --input + --output OR --apply + --receipt')
    import requests
    from dotenv import dotenv_values
    env = dotenv_values(args.env_file)
    base_url = env.get('SUPABASE_URL') or env.get('NEXT_PUBLIC_SUPABASE_URL')
    key = env.get('SUPABASE_SERVICE_ROLE_KEY')
    if not base_url or not key:
        raise RuntimeError('Supabase credentials are missing')
    url = base_url.rstrip('/') + '/rest/v1/'
    session = requests.Session()
    session.headers.update({'apikey': key, 'Authorization': 'Bearer ' + key})

    def request(method, table, **kw):
        response = session.request(method, url + table, timeout=30, **kw)
        if not response.ok:
            raise RuntimeError(f'{method} {table}: HTTP {response.status_code}, {response.text[:300]}')
        return response.json() if response.content else None

    rows = []
    for offset in range(0, 100000, 1000):
        page = request('GET', 'leads', params={'tenant_id': 'eq.' + TENANT, 'select': '*', 'limit': 1000, 'offset': offset, 'order': 'id.asc'})
        rows.extend(page)
        if len(page) < 1000:
            break
    if args.input:
        records = json.loads(Path(args.input).read_text())
        plan = plan_records(records['leads'] if isinstance(records, dict) else records, rows)
        plan['digest'] = fingerprint(plan)
        private_write(args.output, plan)
        print(json.dumps({'plan': args.output, 'digest': plan['digest'], 'operations': len(plan['operations']), 'held': plan['held'], 'unchanged': len(plan['unchanged'])}, indent=2))
        return
    plan = json.loads(Path(args.apply).read_text())
    digest = plan.pop('digest')
    if digest != fingerprint(plan) or plan.get('tenant_id') != TENANT or plan.get('trip_id') != TRIP:
        raise RuntimeError('plan integrity or tenant mismatch')
    by_id = {r['id']: r for r in rows}
    # Validate every precondition before any mutation; PATCH repeats updated_at CAS.
    for op in plan['operations']:
        if by_id.get(op['id']) != op['before']:
            raise RuntimeError('live row changed since plan: ' + op['company'])
    receipt = {'trip_id': TRIP, 'digest': digest, 'verified': [], 'outbound_actions': 0}
    private_write(args.receipt, receipt)
    for op in plan['operations']:
        params = {'id': 'eq.' + op['id'], 'tenant_id': 'eq.' + TENANT} if op['method'] == 'PATCH' else {}
        if op['before']:
            params['updated_at'] = 'eq.' + op['before']['updated_at']
        result = request(op['method'], 'leads', params=params, json=op['payload'], headers={'Prefer': 'return=representation'})
        if not result or len(result) != 1:
            raise RuntimeError('conditional write did not affect exactly one row: ' + op['company'])
        readback = request('GET', 'leads', params={'id': 'eq.' + op['id'], 'tenant_id': 'eq.' + TENANT, 'select': '*'})
        if len(readback) != 1 or any(readback[0].get(k) != v for k, v in op['payload'].items()):
            raise RuntimeError('readback mismatch: ' + op['company'])
        receipt['verified'].append({'id': op['id'], 'company': op['company'], 'method': op['method'], 'evidence_digest': fingerprint(op['payload']['score_breakdown'][KEY])})
        private_write(args.receipt, receipt)
        activity_id = str(uuid.uuid5(uuid.NAMESPACE_URL, TRIP + ':' + op['id'] + ':' + fingerprint(op['payload']['score_breakdown'][KEY])))
        request('POST', 'lead_activities', params={'on_conflict': 'id'}, headers={'Prefer': 'resolution=ignore-duplicates,return=minimal'}, json={
            'id': activity_id, 'tenant_id': TENANT, 'lead_id': op['id'], 'activity_type': 'sales_trip_research',
            'channel': 'research', 'metadata': {'trip_id': TRIP, 'source_urls': op['payload']['score_breakdown'][KEY].get('source_urls', []), 'plan_digest': digest, 'outbound_authorized': False}})
    print(json.dumps({'verified': len(receipt['verified']), 'receipt': args.receipt, 'outbound_actions': 0}))


if __name__ == '__main__':
    main()
