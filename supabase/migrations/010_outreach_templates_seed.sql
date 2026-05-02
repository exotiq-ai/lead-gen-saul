-- 010_outreach_templates_seed.sql
--
-- Stage 2a: seed outreach_sequences with the 6 templates that
-- python-agent/skills/draft.py used to carry as Python literals,
-- so SDRs can edit them from /dashboard/outreach/templates without
-- a code change.
--
-- Schema: outreach_sequences was created in 006_outreach_schema.sql with
--   (id, tenant_id, name, slug, description, steps JSONB, is_active, ts).
-- We use `steps` as a JSONB array of {channel, body, score_min, score_max,
-- variant} objects so multiple templates can live under one sequence row.
--
-- Idempotent via ON CONFLICT (tenant_id, slug).

BEGIN;

-- ─── Exotiq automotive ──────────────────────────────────────────────────────
INSERT INTO outreach_sequences (tenant_id, name, slug, description, steps, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Exotiq Automotive — Default Sequence',
  'exotiq-default',
  'Score-banded IG DM outreach for exotic-car operators. Score 80+: Jay Denver proof. 60-79: peer intro. 55-59: visual/fleet.',
  '[
    {
      "variant": "tier1_proof",
      "label": "IG DM — Jay Denver Proof (Score 80+)",
      "channel": "instagram_dm",
      "score_min": 80,
      "score_max": 100,
      "body": "Hey {first_name}, Gregory here from Exotiq.\n\nJay at Denver Exotic Rentals just replaced his entire ops stack with our Command Center. His words: \"after 10 years in the exotic rental business, we finally have a system that gets what we need.\"\n\n{company_name} is clearly running at a level where this fits. Worth a 15-minute look?"
    },
    {
      "variant": "peer_intro",
      "label": "IG DM — Peer Intro (Score 60-79)",
      "channel": "instagram_dm",
      "score_min": 60,
      "score_max": 79,
      "body": "Hey {first_name}, Gregory here. I run Exotiq. Started in exotics before building the tech.\n\nCurious how you''re handling pricing and fleet logistics at {company_name}. That''s where most operators tell us they''re leaving money on the table.\n\nConnecting with operators this month. Happy to share what we''re learning from the ones already on the platform. No sales pitch."
    },
    {
      "variant": "visual_fleet",
      "label": "IG DM — Visual/Fleet (Score 55-59)",
      "channel": "instagram_dm",
      "score_min": 55,
      "score_max": 59,
      "body": "Hey {first_name}, it''s Gregory at Exotiq.\n\nYour fleet at {company_name} is unreal. You clearly know your market.\n\nI''m connecting with exotic car operators this month and helping optimize fleets. With you running at this scale, I''d love your take. Could we grab 15 minutes?"
    }
  ]'::jsonb,
  true
)
ON CONFLICT (tenant_id, slug) DO UPDATE
  SET steps = EXCLUDED.steps,
      description = EXCLUDED.description,
      updated_at = NOW();

-- ─── MedSpa ─────────────────────────────────────────────────────────────────
INSERT INTO outreach_sequences (tenant_id, name, slug, description, steps, is_active)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'MedSpa Boulder — Default Sequence',
  'medspa-default',
  'Score-banded IG DM outreach for med spas. Score 70+: website audit. 55-69: booking modernization. 45-54: gallery / social proof.',
  '[
    {
      "variant": "website_audit",
      "label": "IG DM — Website Audit (Score 70+)",
      "channel": "instagram_dm",
      "score_min": 70,
      "score_max": 100,
      "body": "Hey {first_name}, Gregory here.\n\nSpent a few minutes on {company_name}''s site — your work is stunning. The before/afters alone are worth more traffic than you''re probably getting.\n\nWe help med spas turn their existing content into a booking machine. One of our clients added 23 new clients in 30 days without touching their ad spend.\n\nWorth a 15-min chat? I''ll show you exactly what I''d change first."
    },
    {
      "variant": "booking_modernization",
      "label": "IG DM — Booking System Pitch (Score 55-69)",
      "channel": "instagram_dm",
      "score_min": 55,
      "score_max": 69,
      "body": "Hey {first_name}, it''s Gregory.\n\nNoticed {company_name} is still using {booking_note} for bookings. Totally fine — until you realize how many people bail when they can''t book instantly at midnight.\n\nWe set up a booking system that works while you sleep. Takes about a week to go live.\n\nHappy to show you what it looks like in practice — no pitch, just a walkthrough."
    },
    {
      "variant": "before_after_gallery",
      "label": "IG DM — Gallery/Social Proof (Score 45-54)",
      "channel": "instagram_dm",
      "score_min": 45,
      "score_max": 54,
      "body": "Hey {first_name}, Gregory here.\n\nYour gallery at {company_name} is genuinely impressive — that kind of work deserves to be seen by 10x the audience.\n\nWe help med spas systemize their social proof so it actually converts. Quick question: are you getting consultations directly from Instagram or mostly from Google?\n\nAsking because the answer changes everything about how we''d approach it."
    }
  ]'::jsonb,
  true
)
ON CONFLICT (tenant_id, slug) DO UPDATE
  SET steps = EXCLUDED.steps,
      description = EXCLUDED.description,
      updated_at = NOW();

COMMIT;
