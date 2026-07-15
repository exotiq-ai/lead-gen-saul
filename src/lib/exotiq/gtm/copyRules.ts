const BANNED_PHRASES = [
  'book a demo',
  'streamline',
  'leverage',
  'synergy',
  'transform',
  'revolutionize',
  'unlock',
  'game-changer',
  'AI-powered solution',
]

export function exotiqCopyLint(text: string) {
  const warnings: string[] = []
  const lower = text.toLowerCase()
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) warnings.push(`banned_phrase:${phrase}`)
  }
  if (text.includes('—')) warnings.push('em_dash')
  if (lower.includes('exoitq.ai')) warnings.push('typo:exoitq.ai')
  return warnings
}

export function buildFirstTouchBrief(market: string) {
  return {
    audience: 'operator',
    market,
    cta: 'Worth comparing notes for 15 minutes?',
    maxPainHypotheses: 1,
    requiredResearchSignals: 3,
    avoid: ['book a demo', 'generic AI claims', 'unsupported revenue claims', 'Instagram handle as hook'],
  }
}
