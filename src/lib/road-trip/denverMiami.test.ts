import assert from 'node:assert/strict'
import test from 'node:test'
import { TRIP_MARKETS, tripLead, googleLeg, safeWebUrl, type TripResearch } from './denverMiami'

const research: TripResearch = {
  trip_id: 'denver-miami-2026', company_name: 'Test operator', city: 'Atlanta', state: 'GA',
  checked_at: '2026-10-11T12:00:00Z', website: 'https://example.test', phone: '4045550199',
  email: null, owner: { name: null, confidence: 'unknown' },
  icp: { self_drive: true, fleet_min_visible: 8, evidence_url: 'https://example.test/fleet' },
  address: { official: '100 Example Rd, Atlanta GA', google: '100 Example Rd, Atlanta GA', status: 'verified_business_location', source_urls: ['https://example.test/contact','https://maps.google.com/?cid=1'] },
  google: { rating: 4.8, review_count: 100, business_status: 'OPERATIONAL', reviews: [], reviews_basis: 'relevance-selected sample, not latest' },
  instagram: { coverage: 'unavailable', posts: [] }, priority: 'A', source_urls: ['https://example.test'],
}
const now = new Date('2026-10-12T00:00:00Z')
const make = (r: TripResearch = research, extra = {}) => tripLead({ id: 'test', status: 'new', score_breakdown: { road_trip_2026: r }, ...extra }, now)

test('corridor order includes required Jacksonville and optional Orlando', () => {
  assert.deepEqual(TRIP_MARKETS.map(m => m.slug), ['denver','kansas-city','st-louis','nashville','atlanta','jacksonville','orlando','palm-beach','fort-lauderdale','miami'])
  assert.equal(TRIP_MARKETS.find(m => m.slug === 'jacksonville')?.kind, 'friend-stop')
  assert.equal(TRIP_MARKETS.find(m => m.slug === 'orlando')?.kind, 'optional')
})

test('qualified current matched location receives Google-only directions, not a walk-in promise', () => {
  const lead = make()!
  assert.equal(lead.visitState, 'call-first')
  assert.match(lead.directions!, /^https:\/\/www.google.com\/maps\/dir\//)
  assert.equal(lead.ownerLabel, 'Owner unverified')
})

test('service area, conflicts, unknown and old addresses never become drive stops', () => {
  for (const status of ['service_area_only','address_conflict','unknown','residential']) {
    assert.equal(make({ ...research, address: { ...research.address, status } })?.directions, null)
  }
  assert.equal(make({ ...research, checked_at: '2026-08-01T00:00:00Z' })?.directions, null)
  assert.equal(make({ ...research, google: { ...research.google, business_status: 'CLOSED_PERMANENTLY' } })?.directions, null)
})

test('unknown fleet and hold priority stay in research even with a street address', () => {
  assert.equal(make({ ...research, icp: { ...research.icp, fleet_min_visible: null } })?.visitState, 'research')
  assert.equal(make({ ...research, priority: 'hold' })?.directions, null)
})

test('suppressed and converted records excluded without mutating history', () => {
  for (const status of ['converted','lost','disqualified']) assert.equal(make(research, {status}), null)
  for (const red_flags of [['unsubscribed'],[{code:'wrong_icp'}],['do_not_contact']]) assert.equal(make(research, {red_flags}), null)
})

test('unsafe URLs and unverified owner candidates are not promoted', () => {
  assert.equal(safeWebUrl('javascript:alert(1)'), null)
  assert.equal(safeWebUrl('https://user:pass@example.test'), null)
  assert.equal(make({ ...research, owner: { name: 'Candidate', confidence: 'low' } })?.ownerLabel, 'Candidate (unverified)')
})

test('appointment requirement preserved and Google links resolve city legs', () => {
  assert.equal(make({ ...research, address: { ...research.address, status: 'appointment_only' } })?.visitState, 'appointment')
  const url = new URL(googleLeg('Atlanta, GA','Jacksonville, FL'))
  assert.equal(url.searchParams.get('origin'), 'Atlanta, GA')
  assert.equal(url.searchParams.get('destination'), 'Jacksonville, FL')
})
