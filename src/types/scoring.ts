export interface ExotiqIcpCriteria {
  min_fleet_size: number
  max_fleet_size: number | null
  required_vehicle_types: string[]
  excluded_vehicle_types: string[]
  target_markets: string[]
  min_vehicle_year: number | null
  min_google_reviews: number | null
  min_ig_followers: number | null
  requires_named_owner: boolean
  requires_booking_flow: boolean
  requires_turo_listed: boolean
  disqualify_experience_only: boolean
  disqualify_brokers: boolean
  disqualify_dealerships: boolean
  disqualify_franchises: boolean
  fleet_tier_weights: Record<string, number>
  market_tier_weights: Record<string, number>
  vehicle_quality_weights: Record<string, number>
}

export interface IcpProfile {
  id: string
  tenant_id: string
  name: string
  description: string | null
  criteria: ExotiqIcpCriteria
  is_active: boolean
  version: number
  created_at: string
  updated_at: string
}

export interface ScoringHistory {
  id: string
  lead_id: string
  tenant_id: string
  icp_profile_id: string
  score: number
  score_breakdown: Record<string, number>
  model_used: string
  input_tokens: number
  output_tokens: number
  cost_cents: number
  scored_at: string
  created_at: string
}

export interface ConversionFeedback {
  id: string
  lead_id: string
  tenant_id: string
  scoring_history_id: string | null
  predicted_score: number | null
  actual_outcome: 'converted' | 'lost' | 'disqualified' | 'qualified'
  feedback_notes: string | null
  submitted_by: string | null
  created_at: string
}
