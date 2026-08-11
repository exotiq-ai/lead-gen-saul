import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ROAD_TRIP_CITIES,
  buildRoadTripLead,
  cityFromLocation,
  filterRoadTripLeads,
  summarizeRoadTripCity,
} from './model'

const baseLead = {
  id: 'lead-1',
  first_name: 'Casey',
  last_name: 'Driver',
  company_name: 'Velocity Exotics',
  company_location: 'Dallas, TX',
  company_domain: 'velocity.example',
  email: 'casey@velocity.example',
  phone: '(214) 555-0100',
  score: 84,
  score_breakdown: {
    company_ig_handle: '@velocityexotics',
    phone_confidence: 'high',
    fleet_size: 18,
    scoring_rationale: 'Verified exotic fleet and direct-booking operation.',
  },
  status: 'scored',
  assigned_to: 'gregory',
  last_activity_at: null,
  red_flags: [],
}

test('road-trip cities preserve Gregory’s route order', () => {
  assert.deepEqual(
    ROAD_TRIP_CITIES.map((city) => city.slug),
    ['dallas', 'austin', 'houston', 'jacksonville', 'orlando', 'tampa', 'miami'],
  )
})

test('city matching is case-insensitive and supports metro labels', () => {
  assert.equal(cityFromLocation('Dallas, TX'), 'dallas')
  assert.equal(cityFromLocation('TAMPA BAY, FL'), 'tampa')
  assert.equal(cityFromLocation('Jacksonville Beach, Florida'), 'jacksonville')
  assert.equal(cityFromLocation('Denver, CO'), null)
})

test('road-trip lead exposes safe one-tap actions and labels city-only precision honestly', () => {
  const lead = buildRoadTripLead(baseLead)

  assert.equal(lead.city, 'dallas')
  assert.equal(lead.locationPrecision, 'city')
  assert.equal(lead.actions.phone?.href, 'tel:+12145550100')
  assert.equal(lead.actions.instagram?.href, 'https://www.instagram.com/velocityexotics/')
  assert.equal(lead.actions.website?.href, 'https://velocity.example')
  assert.match(lead.actions.googleMaps.href, /google\.com\/maps\/search/)
  assert.match(decodeURIComponent(lead.actions.googleMaps.href), /Velocity Exotics Dallas, TX/)
  assert.match(lead.actions.appleMaps.href, /maps\.apple\.com/)
  assert.match(lead.callOpener, /Gregory Ringler/)
  assert.match(lead.callOpener, /Exotiq/)
})

test('street addresses receive exact-address precision while missing locations stay unmapped', () => {
  const street = buildRoadTripLead({ ...baseLead, company_location: '123 Main St, Austin, TX' })
  const missing = buildRoadTripLead({ ...baseLead, company_location: null })

  assert.equal(street.locationPrecision, 'address')
  assert.equal(missing.locationPrecision, 'missing')
  assert.equal(missing.city, null)
})

test('hit-list ranking prioritizes engaged Gregory leads with callable data', () => {
  const routine = buildRoadTripLead({ ...baseLead, id: 'routine', score: 90, assigned_to: 'team', status: 'new' })
  const followUp = buildRoadTripLead({ ...baseLead, id: 'follow', score: 70, assigned_to: 'gregory', status: 'engaged' })

  const sorted = [routine, followUp].sort((a, b) => b.priority - a.priority)
  assert.equal(sorted[0].id, 'follow')
  assert.match(sorted[0].nextAction.reason, /follow-up/i)
})

test('filters and city summary count actionable coverage', () => {
  const leads = [
    buildRoadTripLead(baseLead),
    buildRoadTripLead({ ...baseLead, id: 'lead-2', phone: null, company_domain: null, score: 55, assigned_to: 'team' }),
  ]

  assert.equal(filterRoadTripLeads(leads, { query: '', priorityOnly: true, callableOnly: false, instagramOnly: false }).length, 1)
  assert.equal(filterRoadTripLeads(leads, { query: 'velocity', priorityOnly: false, callableOnly: true, instagramOnly: false }).length, 1)

  assert.deepEqual(summarizeRoadTripCity(leads), {
    total: 2,
    priority: 1,
    callable: 1,
    instagram: 2,
    needsResearch: 1,
    followUps: 0,
  })
})
