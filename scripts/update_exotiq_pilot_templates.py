import os
from dotenv import load_dotenv
from supabase import create_client

TENANT_ID = "00000000-0000-0000-0000-000000000001"
load_dotenv('.env.local')
url = os.environ['NEXT_PUBLIC_SUPABASE_URL']
key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
db = create_client(url, key)

steps = [
    {
        "variant": "large_fleet_operator_control",
        "label": "IG DM -- Large Fleet Operator Control",
        "channel": "instagram_dm",
        "score_min": 80,
        "score_max": 100,
        "body": "Hey {first_name}, Gregory here. I run Exotiq.\n\nAt your scale, the hard part usually is not looking legitimate. It is keeping availability, pricing, deposits, renter checks, and handoffs tight across the team without weakening the customer experience.\n\nThat is the workflow Exotiq is built around for exotic operators: the command center now, with the Drive Exotiq marketplace path coming later this year.\n\nWorth a quick look if I show you where I think this fits for {company_name}?",
    },
    {
        "variant": "fast_market_booking_workflow",
        "label": "IG DM -- Fast Market Booking Workflow",
        "channel": "instagram_dm",
        "score_min": 60,
        "score_max": 79,
        "body": "Hey {first_name}, Gregory here from Exotiq.\n\nExotic demand in your market moves fast. My guess is the money gets made or lost in the gap between someone asking what is available this weekend and a paid, verified booking with deposit handled.\n\nExotiq is built around that operator workflow, fast follow-up, live availability, pricing, renter checks, and a cleaner handoff after the lead comes in.\n\nOpen to comparing notes for 15 minutes this week?",
    },
    {
        "variant": "regional_operator_ops_gap",
        "label": "IG DM -- Regional Operator Ops Gap",
        "channel": "instagram_dm",
        "score_min": 40,
        "score_max": 59,
        "body": "Hey {first_name}, Gregory Ringler here. I run Exotiq.\n\nFor operators growing past the early stage, the issue usually is not whether people want the cars. It is whether pricing, availability, deposits, agreements, and follow-up stay clean without the owner chasing every booking.\n\nExotiq is built around that stage of the business, one operator workflow for the pieces that normally live in texts, spreadsheets, and disconnected tools.\n\nWorth comparing notes for 15 minutes?",
    },
]

# Upsert by slug-like row. Update exotiq-default if present, else insert.
resp = db.table('outreach_sequences').select('id').eq('tenant_id', TENANT_ID).eq('slug', 'exotiq-default').limit(1).execute()
if resp.data:
    db.table('outreach_sequences').update({
        'name': 'Exotiq Automotive -- 2026-06 Operator Outreach',
        'description': 'SOP-aligned operator outreach by segment: large fleet, fast market, regional operators. Avoids generic SaaS language and unsupported claims.',
        'steps': steps,
        'is_active': True,
    }).eq('id', resp.data[0]['id']).execute()
    print('updated exotiq-default')
else:
    db.table('outreach_sequences').insert({
        'tenant_id': TENANT_ID,
        'slug': 'exotiq-default',
        'name': 'Exotiq Automotive -- 2026-06 Operator Outreach',
        'description': 'SOP-aligned operator outreach by segment: large fleet, fast market, regional operators. Avoids generic SaaS language and unsupported claims.',
        'is_active': True,
        'steps': steps,
    }).execute()
    print('inserted exotiq-default')
