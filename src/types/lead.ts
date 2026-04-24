export type LeadStatus =
  | 'new'
  | 'enriching'
  | 'scored'
  | 'outreach'
  | 'engaged'
  | 'qualified'
  | 'converted'
  | 'lost'
  | 'disqualified'

export type AssignedTo = 'gregory' | 'team' | null

export type LeadSource = 'organic' | 'paid' | 'referral' | 'outbound' | 'api'

export type RedFlagCode =
  | 'bounced_email'
  | 'competitor'
  | 'unsubscribed'
  | 'stale_90d'
  | 'duplicate'
  | 'bad_data'
  | 'negative_reply'
  | 'wrong_icp'
  | 'below_fleet_minimum'
  | 'experience_only_operator'
  | 'broker_not_operator'
  | 'is_dealership'
  | 'is_franchise'

export interface RedFlag {
  code: RedFlagCode
  reason: string
  flagged_at: string
}

export interface ScoreBreakdown {
  fleet_size: number
  fleet_tier: number
  vehicle_quality: number
  market_tier: number
  operational_signals: number
  owner_named: number
  assigned_to: number
  exotiq_tier: number
  total: number
}

export interface LeadActivity {
  id: string
  lead_id: string
  tenant_id: string
  type: string
  summary: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface Lead {
  id: string
  tenant_id: string
  external_id: string | null
  status: LeadStatus
  assigned_to: AssignedTo
  source: LeadSource | null

  first_name: string | null
  last_name: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  company_name: string | null
  city: string | null
  state: string | null
  country: string | null

  score: number | null
  score_breakdown: ScoreBreakdown | null
  red_flags: RedFlag[]

  ghl_contact_id: string | null
  ghl_pipeline_stage_id: string | null
  ghl_synced_at: string | null

  enriched_at: string | null
  scored_at: string | null
  outreach_sent_at: string | null
  last_activity_at: string | null

  notes: string | null
  tags: string[]
  metadata: Record<string, unknown>

  created_at: string
  updated_at: string
}
