import type { SupabaseClient } from '@supabase/supabase-js'

/** Row shape we need from `leads` for enrichment */
export type LeadRow = {
  id: string
  tenant_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  company_name: string | null
  company_domain: string | null
  linkedin_url: string | null
  status: string
}

export type EnrichmentResult = {
  success: boolean
  provider: string
  response_data: Record<string, unknown>
  request_data: Record<string, unknown>
  cost_cents: number
  tokens_used?: number
  error?: string
}

export interface EnrichmentProvider {
  name: 'apollo' | 'clearbit' | 'linkedin' | 'saul_web' | (string & {})
  enrich: (
    supabase: SupabaseClient,
    lead: LeadRow,
    enrichmentId: string,
  ) => Promise<EnrichmentResult>
  /** Rough estimate in cents (for display / planning) */
  estimateCost: (lead: LeadRow) => number
}
