export type AgentType =
  | 'orchestrator'
  | 'sourcing'
  | 'enrichment'
  | 'scoring'
  | 'outreach'
  | 'qualifier'

export type AgentRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cost_cents: number
  model: string
}

export interface AgentRun {
  id: string
  tenant_id: string
  agent_type: AgentType
  status: AgentRunStatus
  trigger: 'manual' | 'scheduled' | 'webhook' | 'realtime'
  lead_ids: string[]
  leads_processed: number
  leads_succeeded: number
  leads_failed: number
  token_usage: TokenUsage[]
  total_cost_cents: number
  error_message: string | null
  metadata: Record<string, unknown>
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}
