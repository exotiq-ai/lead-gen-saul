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
        "variant": "premium_booking_handoff",
        "label": "IG DM -- Premium Booking Handoff",
        "channel": "instagram_dm",
        "score_min": 80,
        "score_max": 100,
        "body": "Hey {first_name}, Gregory Ringler here. I run Exotiq.\n\nAt your scale, the hard part usually is not getting attention. It is keeping quote, availability, renter check, deposit, and handoff tight without making the customer experience feel ordinary.\n\nThat is where Exotiq fits. It gives exotic operators one cleaner workflow around the booking instead of scattered texts and manual follow-up.\n\nWorth a quick look this week?",
    },
    {
        "variant": "fast_market_paid_booking_gap",
        "label": "IG DM -- Fast Market Paid Booking Gap",
        "channel": "instagram_dm",
        "score_min": 60,
        "score_max": 79,
        "body": "Hey {first_name}, Gregory Ringler here. I run Exotiq.\n\nRenters in your market move fast, but a premium operator can’t treat every inquiry like a generic quote. The opportunity is tightening the few minutes after someone asks what is available: the right car, right rate, renter check, deposit, and pickup details before they shop around.\n\nExotiq gives exotic operators one cleaner workflow around the booking instead of scattered texts and manual follow-up.\n\nWorth a quick look this week?",
    },
    {
        "variant": "regional_clean_booking_details",
        "label": "IG DM -- Regional Clean Booking Details",
        "channel": "instagram_dm",
        "score_min": 40,
        "score_max": 59,
        "body": "Hey {first_name}, Gregory Ringler here. I run Exotiq.\n\nFor operators growing past the early stage, a missed handoff can cost more than a missed lead. The gap is usually between someone asking what is available and a paid, verified booking with the details handled cleanly.\n\nThat is what Exotiq is built around: fewer scattered steps between inquiry, verification, deposit, and handoff.\n\nWorth comparing notes for 15 minutes?",
    },
]

# Upsert by slug-like row. Update exotiq-default if present, else insert.
resp = db.table('outreach_sequences').select('id').eq('tenant_id', TENANT_ID).eq('slug', 'exotiq-default').limit(1).execute()
if resp.data:
    db.table('outreach_sequences').update({
        'name': 'Exotiq Automotive -- Finest Operator Outreach',
        'description': 'Customer-facing, founder-to-operator outreach. No CRM shorthand, no fleet-signal language, no feature stuffing. Segment by operator scale and market.',
        'steps': steps,
        'is_active': True,
    }).eq('id', resp.data[0]['id']).execute()
    print('updated exotiq-default')
else:
    db.table('outreach_sequences').insert({
        'tenant_id': TENANT_ID,
        'slug': 'exotiq-default',
        'name': 'Exotiq Automotive -- Finest Operator Outreach',
        'description': 'Customer-facing, founder-to-operator outreach. No CRM shorthand, no fleet-signal language, no feature stuffing. Segment by operator scale and market.',
        'is_active': True,
        'steps': steps,
    }).execute()
    print('inserted exotiq-default')
