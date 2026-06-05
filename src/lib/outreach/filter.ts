export interface OutreachSearchLead {
  company_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  company_domain: string | null
  company_location: string | null
  score: number | null
  assigned_to: string | null
  linkedin_url: string | null
  score_breakdown: Record<string, unknown> | null
}

export interface OutreachSearchItem {
  id: string
  lead_id: string
  channel: string
  message_draft: string
  status: string
  generated_by?: string | null
  leads: OutreachSearchLead | null
}

function valuesFromScoreBreakdown(sb: Record<string, unknown> | null | undefined): string[] {
  if (!sb) return []
  return ['company_ig_handle', 'instagram_handle', 'ig_handle', 'instagram_url', 'website', 'source_url', 'fleet_evidence_url']
    .map((key) => sb[key])
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
}

export function searchableOutreachText(item: OutreachSearchItem): string {
  const lead = item.leads
  return [
    item.channel,
    item.status,
    item.generated_by,
    item.message_draft,
    lead?.company_name,
    lead?.first_name,
    lead?.last_name,
    lead?.email,
    lead?.phone,
    lead?.company_domain,
    lead?.company_location,
    lead?.assigned_to,
    lead?.score?.toString(),
    ...valuesFromScoreBreakdown(lead?.score_breakdown),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function filterOutreachItems<T extends OutreachSearchItem>(items: T[], query: string): T[] {
  const terms = query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!terms.length) return items
  return items.filter((item) => {
    const haystack = searchableOutreachText(item)
    return terms.every((term) => haystack.includes(term))
  })
}
