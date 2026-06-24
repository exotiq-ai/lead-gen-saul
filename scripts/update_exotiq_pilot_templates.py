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
        "variant": "premium_recent_content_to_control",
        "label": "IG DM -- Premium Recent Content + Control",
        "channel": "instagram_dm",
        "score_min": 80,
        "score_max": 100,
        "body": "Hey {first_name}, Gregory Ringler here. I run Exotiq.\n\n{personalization_hook}\n\nAt your scale, the hard part usually is not getting attention. It is keeping quote, availability, renter check, deposit, and handoff tight without making the customer experience feel ordinary.\n\nThat is where Exotiq fits. One command center for pricing, bookings, compliance, and guest comms, with Rari handling the admin that steals nights and weekends.\n\nWorth comparing notes for 15 minutes?",
    },
    {
        "variant": "fast_market_recent_content_to_paid_booking",
        "label": "IG DM -- Fast Market Recent Content + Paid Booking Gap",
        "channel": "instagram_dm",
        "score_min": 60,
        "score_max": 79,
        "body": "Hey {first_name}, Gregory Ringler here. I run Exotiq.\n\n{personalization_hook}\n\nRenters in your market move fast, but a premium operator can’t treat every inquiry like a generic quote. The money is usually made or lost between “what do you have this weekend?” and a paid, verified booking.\n\nExotiq gives exotic operators one command center for pricing, availability, deposits, docs, follow-up, and Rari-assisted guest comms.\n\nWorth a quick look this week?",
    },
    {
        "variant": "regional_recent_content_to_clean_handoff",
        "label": "IG DM -- Regional Recent Content + Clean Handoff",
        "channel": "instagram_dm",
        "score_min": 40,
        "score_max": 59,
        "body": "Hey {first_name}, Gregory Ringler here. I run Exotiq.\n\n{personalization_hook}\n\nFor operators growing past the early stage, a missed handoff can cost more than a missed lead. The gap is usually between someone asking what is available and a paid, verified booking with the details handled cleanly.\n\nThat is what Exotiq is built around: one cleaner path from inquiry to renter check, deposit, agreement, and handoff.\n\nWorth comparing notes for 15 minutes?",
    },
]

description = (
    'Customer-facing, founder-to-operator outreach. Lead with a specific recent-content/business hook, '
    'then one money leak. No CRM shorthand, no fleet-signal language, no feature stuffing.'
)

# Upsert by slug-like row. Update exotiq-default if present, else insert.
resp = db.table('outreach_sequences').select('id').eq('tenant_id', TENANT_ID).eq('slug', 'exotiq-default').limit(1).execute()
if resp.data:
    db.table('outreach_sequences').update({
        'name': 'Exotiq Automotive -- Recent-Context Operator Outreach',
        'description': description,
        'steps': steps,
        'is_active': True,
    }).eq('id', resp.data[0]['id']).execute()
    print('updated exotiq-default')
else:
    db.table('outreach_sequences').insert({
        'tenant_id': TENANT_ID,
        'slug': 'exotiq-default',
        'name': 'Exotiq Automotive -- Recent-Context Operator Outreach',
        'description': description,
        'is_active': True,
        'steps': steps,
    }).execute()
    print('inserted exotiq-default')
