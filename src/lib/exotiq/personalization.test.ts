import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPersonalizationContext } from './personalization'

test('prefers sourced recent content over legacy research fields', () => {
  const result = buildPersonalizationContext({
    companyLocation: 'Miami, FL',
    scoreBreakdown: {
      latest_news_pr_summary: 'Operator opened a second Miami location',
      latest_news_pr_url: 'https://example.com/news',
      latest_news_pr_confidence: 'CONFIRMED',
      fleet_size: 30,
      scoring_rationale: 'Legacy note',
    },
  })

  assert.equal(result.label, 'News hook')
  assert.equal(result.summary, 'Operator opened a second Miami location')
  assert.equal(result.sourceUrl, 'https://example.com/news')
  assert.equal(result.ready, true)
})

test('builds useful fleet context from existing structured evidence', () => {
  const result = buildPersonalizationContext({
    companyLocation: 'Denver, CO',
    scoreBreakdown: {
      fleet_size: 25,
      fleet_confidence: 'MEDIUM_CATALOG_COUNT',
      fleet_evidence_url: 'https://operator.example/fleet',
    },
  })

  assert.equal(result.label, 'Fleet evidence')
  assert.match(result.summary, /25-vehicle fleet/)
  assert.match(result.summary, /Denver, CO/)
  assert.equal(result.confidence, 'MEDIUM CATALOG COUNT')
  assert.equal(result.sourceUrl, 'https://operator.example/fleet')
})

test('uses legacy rationale only as a clearly labeled review note', () => {
  const result = buildPersonalizationContext({
    scoreBreakdown: {
      scoring_rationale: 'Multi-market operator with airport delivery and a visible Ferrari catalog.',
      source_url: 'https://operator.example.',
    },
  })

  assert.equal(result.label, 'Operator evidence')
  assert.equal(result.confidence, 'legacy research note, verify before use')
  assert.equal(result.sourceUrl, 'https://operator.example')
})

test('fails safe when no sourced hook exists', () => {
  const result = buildPersonalizationContext({ scoreBreakdown: {} })

  assert.equal(result.label, 'Research needed')
  assert.equal(result.ready, false)
  assert.match(result.summary, /verify one useful business observation/i)
})
