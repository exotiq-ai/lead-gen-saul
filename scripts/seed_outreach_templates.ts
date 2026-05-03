/**
 * Seed outreach_sequences with the canonical Exotiq + MedSpa templates.
 *
 * Equivalent to running supabase/migrations/010_outreach_templates_seed.sql
 * but going through the Supabase REST API so we don't need a postgres
 * connection or a paste into the SQL editor. Idempotent via the unique
 * constraint on (tenant_id, slug) + the Prefer: resolution=merge-duplicates
 * header.
 *
 * Usage:
 *   tsx scripts/seed_outreach_templates.ts
 *
 * Reads SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * from .env.local at the repo root.
 */

import { config as loadEnv } from 'dotenv'
import path from 'node:path'

loadEnv({ path: path.resolve(process.cwd(), '.env.local') })
loadEnv({ path: path.resolve(process.cwd(), '.env') })

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}

const EXOTIQ_TID = '00000000-0000-0000-0000-000000000001'
const MEDSPA_TID = '11111111-1111-1111-1111-111111111111'

const exotiqSteps = [
  {
    variant: 'tier1_proof',
    label: 'IG DM — Jay Denver Proof (Score 80+)',
    channel: 'instagram_dm',
    score_min: 80,
    score_max: 100,
    body:
      'Hey {first_name}, Gregory here from Exotiq.\n\n' +
      'Jay at Denver Exotic Rentals just replaced his entire ops stack with our Command Center. ' +
      'His words: "after 10 years in the exotic rental business, we finally have a system that gets what we need."\n\n' +
      '{company_name} is clearly running at a level where this fits. Worth a 15-minute look?',
  },
  {
    variant: 'peer_intro',
    label: 'IG DM — Peer Intro (Score 60-79)',
    channel: 'instagram_dm',
    score_min: 60,
    score_max: 79,
    body:
      'Hey {first_name}, Gregory here. I run Exotiq. Started in exotics before building the tech.\n\n' +
      "Curious how you're handling pricing and fleet logistics at {company_name}. " +
      "That's where most operators tell us they're leaving money on the table.\n\n" +
      "Connecting with operators this month. Happy to share what we're learning from the ones already on the platform. No sales pitch.",
  },
  {
    variant: 'visual_fleet',
    label: 'IG DM — Visual/Fleet (Score 55-59)',
    channel: 'instagram_dm',
    score_min: 55,
    score_max: 59,
    body:
      "Hey {first_name}, it's Gregory at Exotiq.\n\n" +
      'Your fleet at {company_name} is unreal. You clearly know your market.\n\n' +
      "I'm connecting with exotic car operators this month and helping optimize fleets. " +
      "With you running at this scale, I'd love your take. Could we grab 15 minutes?",
  },
]

const medspaSteps = [
  {
    variant: 'website_audit',
    label: 'IG DM — Website Audit (Score 70+)',
    channel: 'instagram_dm',
    score_min: 70,
    score_max: 100,
    body:
      'Hey {first_name}, Gregory here.\n\n' +
      "Spent a few minutes on {company_name}'s site — your work is stunning. The before/afters alone are worth more traffic than you're probably getting.\n\n" +
      'We help med spas turn their existing content into a booking machine. One of our clients added 23 new clients in 30 days without touching their ad spend.\n\n' +
      "Worth a 15-min chat? I'll show you exactly what I'd change first.",
  },
  {
    variant: 'booking_modernization',
    label: 'IG DM — Booking System Pitch (Score 55-69)',
    channel: 'instagram_dm',
    score_min: 55,
    score_max: 69,
    body:
      "Hey {first_name}, it's Gregory.\n\n" +
      "Noticed {company_name} is still using {booking_note} for bookings. Totally fine — until you realize how many people bail when they can't book instantly at midnight.\n\n" +
      'We set up a booking system that works while you sleep. Takes about a week to go live.\n\n' +
      'Happy to show you what it looks like in practice — no pitch, just a walkthrough.',
  },
  {
    variant: 'before_after_gallery',
    label: 'IG DM — Gallery/Social Proof (Score 45-54)',
    channel: 'instagram_dm',
    score_min: 45,
    score_max: 54,
    body:
      'Hey {first_name}, Gregory here.\n\n' +
      "Your gallery at {company_name} is genuinely impressive — that kind of work deserves to be seen by 10x the audience.\n\n" +
      'We help med spas systemize their social proof so it actually converts. Quick question: are you getting consultations directly from Instagram or mostly from Google?\n\n' +
      "Asking because the answer changes everything about how we'd approach it.",
  },
]

const rows = [
  {
    tenant_id: EXOTIQ_TID,
    name: 'Exotiq Automotive — Default Sequence',
    slug: 'exotiq-default',
    description:
      'Score-banded IG DM outreach for exotic-car operators. Score 80+: Jay Denver proof. 60-79: peer intro. 55-59: visual/fleet.',
    steps: exotiqSteps,
    is_active: true,
  },
  {
    tenant_id: MEDSPA_TID,
    name: 'MedSpa Boulder — Default Sequence',
    slug: 'medspa-default',
    description:
      'Score-banded IG DM outreach for med spas. Score 70+: website audit. 55-69: booking modernization. 45-54: gallery / social proof.',
    steps: medspaSteps,
    is_active: true,
  },
]

async function main() {
  const endpoint = `${url}/rest/v1/outreach_sequences?on_conflict=tenant_id,slug`
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: key!,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error('upsert failed:', res.status, text)
    process.exit(1)
  }
  const payload = JSON.parse(text) as Array<{
    tenant_id: string
    slug: string
    steps: unknown[]
  }>
  for (const r of payload) {
    console.log(`upserted: ${r.tenant_id} ${r.slug} steps=${r.steps.length}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
