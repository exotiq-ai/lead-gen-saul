export type EnrichmentProvider =
  | 'apollo'
  | 'clearbit'
  | 'linkedin'
  | 'scraper'
  | 'saul_web'

export interface SaulWebEnrichmentData {
  ig_handle: string | null
  ig_followers_approx: number | null
  turo_listed: boolean | null
  website_url: string | null
  has_booking_flow: boolean | null
  google_review_count_approx: number | null
  named_owner: boolean | null
  named_owner_name: string | null
  vehicle_quality_detected: string | null
  fleet_size_estimate_low: number | null
  fleet_size_estimate_high: number | null
  experience_only_risk: boolean | null
}

export interface EnrichmentRecord {
  id: string
  lead_id: string
  tenant_id: string
  provider: EnrichmentProvider
  raw_data: Record<string, unknown>
  parsed_data: SaulWebEnrichmentData | Record<string, unknown>
  success: boolean
  error_message: string | null
  model_used: string | null
  input_tokens: number | null
  output_tokens: number | null
  cost_cents: number | null
  enriched_at: string
  created_at: string
}
