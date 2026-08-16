import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ORLANDO_ROUTE_A_URL,
  ORLANDO_ROUTE_B_URL,
  ORLANDO_VISIT_STOPS,
  routeLegUrl,
} from './orlandoVisitRoute'

test('Orlando visit plan keeps six unique verified stops in route order', () => {
  assert.equal(ORLANDO_VISIT_STOPS.length, 6)
  assert.deepEqual(ORLANDO_VISIT_STOPS.map((stop) => stop.order), [1, 2, 3, 4, 5, 6])
  assert.equal(new Set(ORLANDO_VISIT_STOPS.map((stop) => stop.leadId)).size, 6)
  assert.equal(ORLANDO_VISIT_STOPS.some((stop) => stop.companyName.includes('Corsa Automotive')), false)
})

test('all navigation remains inside Google Maps and uses the requested starting point', () => {
  assert.match(ORLANDO_ROUTE_A_URL, /^https:\/\/www\.google\.com\/maps\/dir\//)
  assert.match(ORLANDO_ROUTE_A_URL, /4725\+Vineland\+Rd/)
  assert.match(ORLANDO_ROUTE_B_URL, /^https:\/\/www\.google\.com\/maps\/dir\//)
  assert.match(routeLegUrl(0), /4725\+Vineland\+Rd/)
  assert.match(routeLegUrl(5), /10195\+Ancora\+Cir/)
})
