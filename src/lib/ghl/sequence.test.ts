import test from 'node:test'
import assert from 'node:assert/strict'
import { ghlTaskIdempotencyMarker, opportunityBlocksSequence } from './sequence'

test('open and won GHL opportunities block cold sequence enrollment and sending', () => {
  assert.equal(opportunityBlocksSequence('open'), true)
  assert.equal(opportunityBlocksSequence('Won'), true)
  assert.equal(opportunityBlocksSequence('lost'), false)
  assert.equal(opportunityBlocksSequence('abandoned'), false)
  assert.equal(opportunityBlocksSequence(null), false)
})

test('GHL task idempotency marker is deterministic and visible in task bodies', () => {
  assert.equal(ghlTaskIdempotencyMarker(' enrollment:v1:call_1 '), '[Exotiq action: enrollment:v1:call_1]')
})
