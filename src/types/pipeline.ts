export interface PipelineStage {
  id: string
  tenant_id: string
  ghl_stage_id: string | null
  name: string
  slug: string
  order: number
  color: string
  is_terminal: boolean
  created_at: string
  updated_at: string
}

export interface PipelineStageSummary {
  stage_id: string
  stage_name: string
  stage_slug: string
  stage_order: number
  stage_color: string
  lead_count: number
  avg_score: number | null
  total_value: number | null
}

export interface PipelineSummary {
  tenant_id: string
  stages: PipelineStageSummary[]
  total_leads: number
  total_qualified: number
  total_converted: number
  conversion_rate: number | null
  generated_at: string
}

export const PIPELINE_STAGE_COLORS: Record<string, string> = {
  new: '#6366f1',
  enriching: '#8b5cf6',
  scored: '#3b82f6',
  outreach: '#f59e0b',
  engaged: '#10b981',
  qualified: '#22c55e',
  converted: '#16a34a',
  lost: '#ef4444',
  disqualified: '#6b7280',
}
