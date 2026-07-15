import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertAllowedMarket,
  buildFounderSenderConfig,
  chooseOutreachRoute,
  DEFAULT_EXOTIQ_GTM_CONFIG,
} from './config'

test('phase 1 allows US and plans UK as disabled phase 2', () => {
  assert.equal(assertAllowedMarket('US', DEFAULT_EXOTIQ_GTM_CONFIG), true)
  assert.equal(assertAllowedMarket('GB', DEFAULT_EXOTIQ_GTM_CONFIG), false)
})

test('founder sender uses Gregory with hello reply-to and approved address', () => {
  assert.deepEqual(buildFounderSenderConfig(DEFAULT_EXOTIQ_GTM_CONFIG), {
    fromName: 'Gregory Ringler | Exotiq',
    sendingAddress: 'gregory@hello.exotiq.ai',
    replyTo: 'hello@exotiq.ai',
    physicalAddress: '1001 S Main St #6709, Kalispell, MT 59901',
  })
})

test('score 5 and large fleets route Gregory call first', () => {
  assert.equal(chooseOutreachRoute({ score: 100, fleetSize: 10, countryCode: 'US' }).route, 'call_only_gregory')
  assert.equal(chooseOutreachRoute({ score: 72, fleetSize: 25, countryCode: 'US' }).route, 'call_only_gregory')
})

test('eligible US tier 2 leads use email plus IG around 15 minute founder call', () => {
  assert.deepEqual(chooseOutreachRoute({ score: 73, fleetSize: 8, countryCode: 'US', hasEmail: true, hasInstagram: true }), {
    route: 'email_plus_ig',
    cta: '15-minute founder call',
    phase: 1,
    reason: 'US phase 1 operator with email and IG support channel',
  })
})

test('UK operators are planned but held until phase 2 is enabled', () => {
  assert.deepEqual(chooseOutreachRoute({ score: 90, fleetSize: 20, countryCode: 'GB', hasEmail: true }), {
    route: 'manual_review',
    cta: '15-minute founder call',
    phase: 2,
    reason: 'UK phase 2 is planned but disabled',
  })
})
