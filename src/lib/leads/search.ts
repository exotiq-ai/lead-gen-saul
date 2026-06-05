const SEARCHABLE_LEAD_COLUMNS = [
  'company_name',
  'first_name',
  'last_name',
  'email',
  'phone',
  'company_domain',
  'company_location',
  'company_industry',
]

export function normalizeLeadSearchTerm(value: string): string {
  return value
    .trim()
    .replace(/[,%]/g, ' ')
    .replace(/\s+/g, ' ')
}

export function buildLeadSearchOrFilter(value: string): string {
  const term = normalizeLeadSearchTerm(value)
  return SEARCHABLE_LEAD_COLUMNS
    .map((column) => `${column}.ilike.%${term}%`)
    .join(',')
}
