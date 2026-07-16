export type PersonalizationContext = {
  label: 'IG hook' | 'Partnership hook' | 'News hook' | 'Business hook' | 'Fleet evidence' | 'Operator evidence' | 'Research needed'
  summary: string
  ageDays: number | null
  stale: boolean
  confidence: string
  sourceUrl: string | null
  ready: boolean
}

type PersonalizationInput = {
  companyLocation?: string | null
  scoreBreakdown?: Record<string, unknown> | null
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function firstUrl(...values: unknown[]): string | null {
  const value = firstText(...values)
  if (!value) return null
  const trimmed = value.replace(/[.,)]+$/, '')
  return /^https?:\/\//i.test(trimmed) ? trimmed : null
}

function daysOld(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return null
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000))
}

function compactText(value: string, limit = 240): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1).trimEnd()}…`
}

function positiveNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number) && number > 0) return Math.round(number)
  }
  return null
}

function confidenceLabel(raw: unknown, fallback: string): string {
  const value = typeof raw === 'string' ? raw.trim().replaceAll('_', ' ') : ''
  return value || fallback
}

function recentContext(
  label: PersonalizationContext['label'],
  summary: string,
  ageDays: number | null,
  staleAfterDays: number,
  confidence: string,
  sourceUrl: string | null,
): PersonalizationContext {
  return {
    label,
    summary: compactText(summary),
    ageDays,
    stale: ageDays != null && ageDays > staleAfterDays,
    confidence,
    sourceUrl,
    ready: true,
  }
}

export function buildPersonalizationContext({
  companyLocation,
  scoreBreakdown,
}: PersonalizationInput): PersonalizationContext {
  const sb = scoreBreakdown ?? {}

  const instagram = firstText(sb.latest_instagram_post_summary, sb.recent_ig_post)
  if (instagram) {
    return recentContext(
      'IG hook',
      instagram,
      daysOld(sb.latest_instagram_post_observed_at) ?? daysOld(sb.latest_instagram_post_fetched_at),
      30,
      confidenceLabel(sb.latest_instagram_post_confidence, 'public social signal'),
      firstUrl(sb.latest_instagram_post_url, sb.instagram_profile_url, sb.company_ig_handle),
    )
  }

  const partnership = firstText(sb.latest_brand_partnership_summary)
  if (partnership) {
    return recentContext(
      'Partnership hook',
      partnership,
      daysOld(sb.latest_brand_partnership_published_at) ?? daysOld(sb.latest_brand_partnership_fetched_at),
      60,
      confidenceLabel(sb.latest_brand_partnership_confidence, 'public media signal'),
      firstUrl(sb.latest_brand_partnership_url),
    )
  }

  const news = firstText(sb.latest_news_pr_summary, sb.recent_news_pr)
  if (news) {
    return recentContext(
      'News hook',
      news,
      daysOld(sb.latest_news_pr_published_at) ?? daysOld(sb.latest_news_pr_fetched_at),
      30,
      confidenceLabel(sb.latest_news_pr_confidence, 'public media signal'),
      firstUrl(sb.latest_news_pr_url),
    )
  }

  const business = firstText(sb.latest_business_observation_summary)
  if (business) {
    return recentContext(
      'Business hook',
      business,
      daysOld(sb.latest_business_observation_fetched_at),
      30,
      confidenceLabel(sb.latest_business_observation_confidence, 'website observation'),
      firstUrl(sb.latest_business_observation_url, sb.source_url, sb.website),
    )
  }

  const fleetSize = positiveNumber(sb.fleet_size, sb.estimated_fleet_size, sb.vehicle_card_count)
  if (fleetSize) {
    const confidence = confidenceLabel(sb.fleet_confidence, 'estimate, verify before use')
    const vehicleExamples = firstText(sb.vehicle_examples, sb.fleet_vehicle_types)
    const summary = [
      `Research currently estimates a ${fleetSize}-vehicle fleet`,
      vehicleExamples ? `with visible examples including ${compactText(vehicleExamples, 120)}` : null,
      companyLocation ? `in ${companyLocation}` : null,
    ].filter(Boolean).join(' ')

    return {
      label: 'Fleet evidence',
      summary: `${summary}. Treat the count as research context until the linked source is checked.`,
      ageDays: daysOld(sb.fleet_last_enriched_at),
      stale: false,
      confidence,
      sourceUrl: firstUrl(sb.fleet_evidence_url, sb.source_url, sb.website),
      ready: true,
    }
  }

  const rationale = firstText(sb.scoring_rationale, sb.rationale)
  if (rationale) {
    return {
      label: 'Operator evidence',
      summary: compactText(rationale),
      ageDays: daysOld(sb.enriched_at),
      stale: false,
      confidence: 'legacy research note, verify before use',
      sourceUrl: firstUrl(sb.source_url, sb.website, sb.fleet_evidence_url),
      ready: true,
    }
  }

  return {
    label: 'Research needed',
    summary: 'No sourced operator hook is stored yet. Open the website or Instagram profile and verify one useful business observation before using this draft.',
    ageDays: null,
    stale: false,
    confidence: 'missing',
    sourceUrl: firstUrl(sb.source_url, sb.website),
    ready: false,
  }
}
