import os
from dotenv import load_dotenv
from supabase import create_client

TENANT_ID = "00000000-0000-0000-0000-000000000001"
load_dotenv('.env.local')
url=os.environ['NEXT_PUBLIC_SUPABASE_URL']
key=os.environ['SUPABASE_SERVICE_ROLE_KEY']
db=create_client(url,key)

steps = [
    {
        "variant": "founding_operator_score_5",
        "label": "IG DM -- Founding Operator Pilot (Score 5)",
        "channel": "instagram_dm",
        "score_min": 80,
        "score_max": 100,
        "body": "Hey {first_name}, Gregory here from Exotiq.\n\nWe’re onboarding a small group of serious exotic operators ahead of the Drive Exotiq marketplace rollout this year. {company_name} looks like the kind of fleet that should be in that first group.\n\nThe pilot is simple: command center, direct-booking flow, and insurance-readiness support around your actual operation. Run it for 30 days, then decide if it earns a permanent seat.\n\nWorth a quick look?"
    },
    {
        "variant": "marketplace_direct_booking",
        "label": "IG DM -- Marketplace + Direct Booking (Score 3-4)",
        "channel": "instagram_dm",
        "score_min": 60,
        "score_max": 79,
        "body": "Hey {first_name}, Gregory here. I run Exotiq.\n\nWe’re building the command center for exotic rental operators, plus the Drive Exotiq marketplace rolling out this year. The goal is simple: help strong fleets own more direct demand instead of depending on scattered channels.\n\n{company_name} stood out as a good fit. Want me to send over what the 30-day founding operator pilot looks like?"
    },
    {
        "variant": "pilot_peer_intro",
        "label": "IG DM -- Peer Pilot Intro (Score 55-59)",
        "channel": "instagram_dm",
        "score_min": 55,
        "score_max": 59,
        "body": "Hey {first_name}, Gregory here from Exotiq.\n\nI’m connecting with exotic rental operators this week as we open up a 30-day founding operator pilot. Command center first, marketplace and insurance infrastructure coming this year.\n\nNot a generic SaaS pitch. We’re trying to work with operators who actually understand this market. Is {company_name} open to taking a quick look?"
    }
]

# Upsert by slug-like row. Update exotiq-default if present, else insert.
resp=db.table('outreach_sequences').select('id').eq('tenant_id', TENANT_ID).eq('slug','exotiq-default').limit(1).execute()
if resp.data:
    db.table('outreach_sequences').update({'steps': steps, 'is_active': True}).eq('id', resp.data[0]['id']).execute()
    print('updated exotiq-default')
else:
    db.table('outreach_sequences').insert({'tenant_id':TENANT_ID,'slug':'exotiq-default','name':'Exotiq default founding operator pilot','is_active':True,'steps':steps}).execute()
    print('inserted exotiq-default')
