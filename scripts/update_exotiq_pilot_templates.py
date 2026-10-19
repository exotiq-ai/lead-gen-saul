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
        "label": "IG DM -- Founder Launch + Operator Proof",
        "channel": "instagram_dm",
        "score_min": 80,
        "score_max": 100,
        "body": "Hey {first_name},\n\nI’m Gregory, founder of Exotiq. We’ve launched Drive Exotiq exclusively for luxury and exotic car rentals, and we’re onboarding select fleets in key cities.\n\n{personalization_hook}\n\nThe Exotiq Command Center runs the rental backend, from dynamic pricing to bookings and fleet operations. One connected system, not a stack of separate tools.\n\nEd at Revel + Roam put it simply after switching: “The operational gains were immediate.”\n\nDo you have 15 minutes this week to talk about bringing {company_name} onto the platform?",
    },
    {
        "variant": "fast_market_recent_content_to_paid_booking",
        "label": "IG DM -- Founder Launch + Connected Backend",
        "channel": "instagram_dm",
        "score_min": 60,
        "score_max": 79,
        "body": "Hey {first_name},\n\nI’m Gregory, founder of Exotiq. We’ve launched Drive Exotiq, our renter-facing platform exclusively for luxury and exotic rentals. We’re onboarding select fleets in key cities.\n\n{personalization_hook}\n\nThe Exotiq Command Center connects the rental backend, including dynamic pricing, bookings and fleet operations, in one system.\n\nOperators on Exotiq are already saving time and growing revenue with smarter pricing and less manual admin.\n\nDo you have 15 minutes this week to talk about {company_name} joining the platform?",
    },
    {
        "variant": "regional_recent_content_to_clean_handoff",
        "label": "IG DM -- Founder Launch + Fleet Fit",
        "channel": "instagram_dm",
        "score_min": 40,
        "score_max": 59,
        "body": "Hey {first_name},\n\nI’m Gregory, founder of Exotiq. We’ve launched Drive Exotiq for luxury and exotic car rentals, and we’re inviting select fleets to join.\n\n{personalization_hook}\n\nDrive Exotiq connects the renter experience to the Exotiq Command Center, the backend for pricing, bookings and day-to-day fleet operations.\n\nOperators on Exotiq are already saving time and growing revenue with smarter pricing and less manual admin.\n\nCould we connect for 15 minutes this week to discuss whether it fits {company_name}?",
    },
]

description = (
    'Founder launch-led invitation: Drive Exotiq luxury/exotic renter platform, select fleet onboarding, '
    'connected Exotiq Command Center backend, one supported proof point and a direct call ask. '
    'Only sourced personalization; review claims, relationship and qualification before release. No sending authorization.'
)

resp = db.table('outreach_sequences').select('id').eq('tenant_id', TENANT_ID).eq('slug', 'exotiq-default').limit(1).execute()
if resp.data:
    db.table('outreach_sequences').update({
        'name': 'Exotiq Automotive -- Founder Launch Outreach',
        'description': description,
        'steps': steps,
        'is_active': True,
    }).eq('tenant_id', TENANT_ID).eq('id', resp.data[0]['id']).execute()
    print('updated exotiq-default')
else:
    db.table('outreach_sequences').insert({
        'tenant_id': TENANT_ID,
        'slug': 'exotiq-default',
        'name': 'Exotiq Automotive -- Founder Launch Outreach',
        'description': description,
        'is_active': True,
        'steps': steps,
    }).execute()
    print('inserted exotiq-default')
