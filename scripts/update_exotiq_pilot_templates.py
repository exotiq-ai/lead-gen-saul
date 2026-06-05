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
        "variant": "operator_control_score_5",
        "label": "IG DM -- Operator Control / Phone-First Backup (Score 5)",
        "channel": "instagram_dm",
        "score_min": 80,
        "score_max": 100,
        "body": "Hey {first_name}, Gregory here from Exotiq.\n\nI started in exotics before building the tech. {company_name} looks like the kind of operation where the hard part is not getting attention, it is keeping pricing, availability, deposits, renter checks, and handoffs clean while demand moves.\n\nThat is the workflow we are building around: command center first, Drive Exotiq marketplace path second.\n\nWorth comparing notes for 15 minutes if I show you where I think this fits?"
    },
    {
        "variant": "direct_booking_workflow_score_3_4",
        "label": "IG DM -- Direct Booking Workflow (Score 3-4)",
        "channel": "instagram_dm",
        "score_min": 60,
        "score_max": 79,
        "body": "Hey {first_name}, Gregory here. I run Exotiq.\n\nMy guess is the expensive part at {company_name} is not demand. It is the handoff from a fast inquiry to a paid, verified booking with pricing, availability, deposit, docs, and pickup details handled cleanly.\n\nThat is what Exotiq is built around for exotic operators, not another generic rental dashboard.\n\nWorth a quick look if I show you where I think this fits?"
    },
    {
        "variant": "operator_peer_intro_score_55_59",
        "label": "IG DM -- Operator Peer Intro (Score 55-59)",
        "channel": "instagram_dm",
        "score_min": 55,
        "score_max": 59,
        "body": "Hey {first_name}, Gregory here from Exotiq.\n\nI am talking with exotic rental operators about the pieces that usually get messy as the business grows: availability, weekend pricing, deposits, driver checks, and follow-up living in too many places.\n\nIf {company_name} is dealing with any of that, Exotiq may be relevant. Command center first, marketplace path second.\n\nWorth comparing notes for 15 minutes?"
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
