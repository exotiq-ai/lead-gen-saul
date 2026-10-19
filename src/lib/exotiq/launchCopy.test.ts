import assert from 'node:assert/strict'
import test from 'node:test'
import { sequenceActionPayload } from './sequenceCopy'
import { sequenceSteps } from './sequence'
const c={firstName:'Alex',companyName:'Test Exotics',initialDraft:'Subject: Approved\n\nUnchanged.',mode:'live' as const}
test('followups retire leak-first copy and use distinct launch/backend/founder angles',()=>{
 const steps=sequenceSteps('live').filter(s=>['email_2','email_3','email_close'].includes(s.key))
 const bodies=steps.map(s=>sequenceActionPayload(s,c).text||'')
 for(const body of bodies){assert.match(body,/Drive Exotiq/);assert.doesNotMatch(body,/expensive (?:leak|gap)|tightening the path|worth comparing|not be much to fix|—/i)}
 assert.equal(new Set(bodies).size,3)
 assert.match(bodies[0],/Command Center/)
 assert.match(bodies[1],/cars|enthusiast/i)
})
test('first approved email is preserved byte for byte',()=>{
 const p=sequenceActionPayload(sequenceSteps('live')[0],c);assert.equal(p.text,'Unchanged.');assert.equal(p.subject,'Approved')
})
