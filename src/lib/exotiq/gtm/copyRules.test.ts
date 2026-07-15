import assert from 'node:assert/strict'
import test from 'node:test'
import {
  exotiqCopyLint,
  buildFirstTouchBrief,
} from './copyRules'

test('copy lint blocks banned phrases, em dashes, demo language, and exoitq typo', () => {
  const lint = exotiqCopyLint('Let me book a demo — this AI-powered solution will unlock revenue at exoitq.ai')
  assert.deepEqual(lint.sort(), ['banned_phrase:AI-powered solution', 'banned_phrase:book a demo', 'banned_phrase:unlock', 'em_dash', 'typo:exoitq.ai'].sort())
})

test('first touch brief uses the 15 minute founder call and one-pain rule', () => {
  assert.deepEqual(buildFirstTouchBrief('Miami / South Florida'), {
    audience: 'operator',
    market: 'Miami / South Florida',
    cta: 'Worth comparing notes for 15 minutes?',
    maxPainHypotheses: 1,
    requiredResearchSignals: 3,
    avoid: ['book a demo', 'generic AI claims', 'unsupported revenue claims', 'Instagram handle as hook'],
  })
})
