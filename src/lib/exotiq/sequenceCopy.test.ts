import assert from 'node:assert/strict'
import test from 'node:test'
import { sequenceActionPayload } from './sequenceCopy'
import { sequenceSteps } from './sequence'

const context = {
  firstName: 'Casey',
  companyName: 'Peak Exotics',
  initialDraft: 'Subject: Peak Exotics booking flow\n\nHey Casey,\n\nApproved personalized copy.',
  mode: 'live' as const,
  instagramUrl: 'https://instagram.com/peakexotics',
  phone: '+13035551212',
}

test('first email preserves the approved dashboard subject and body', () => {
  const payload = sequenceActionPayload(sequenceSteps('live')[0], context)
  assert.equal(payload.subject, 'Peak Exotics booking flow')
  assert.match(payload.text || '', /Approved personalized copy/)
})

test('call and Instagram steps become human tasks rather than automatic calls or DMs', () => {
  const call = sequenceActionPayload(sequenceSteps('live')[1], context)
  const instagram = sequenceActionPayload(sequenceSteps('live')[2], context)
  assert.match(call.title || '', /Call Peak Exotics/)
  assert.match(instagram.body || '', /manually/)
  assert.match(instagram.body || '', /instagram\.com\/peakexotics/)
})

test('demo email is unmistakably labeled and states that no customer was contacted', () => {
  const payload = sequenceActionPayload(sequenceSteps('demo')[0], { ...context, mode: 'demo' })
  assert.match(payload.subject || '', /^\[DEMO\]/)
  assert.match(payload.text || '', /No customer was contacted/)
})
