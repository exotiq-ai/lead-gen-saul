import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { LeadDetailClient } from './LeadDetailClient'
import type { Lead, LeadActivity } from '@/types/lead'
import type { EnrichmentRecord } from '@/types/enrichment'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export interface ScoringHistoryRecord {
  id: string
  lead_id: string
  old_score: number | null
  new_score: number
  reason: string | null
  triggered_by: string | null
  created_at: string
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = getServiceClient()

  // 1. Fetch lead
  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (!lead) notFound()

  // 2. Pipeline stage name
  const stageId = (lead as Record<string, unknown>).stage_id
    ?? (lead as Record<string, unknown>).ghl_pipeline_stage_id
  let stageName: string | null = null
  if (stageId) {
    const { data: stage } = await supabase
      .from('pipeline_stages')
      .select('name')
      .eq('id', stageId)
      .single()
    stageName = stage?.name ?? null
  }

  // 3. Activities (last 20)
  const { data: activities } = await supabase
    .from('lead_activities')
    .select('*')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })
    .limit(20)

  // 4. Enrichments
  const { data: enrichments } = await supabase
    .from('enrichments')
    .select('*')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })

  // 5. Scoring history
  const { data: scoringHistory } = await supabase
    .from('scoring_history')
    .select('*')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })

  return (
    <LeadDetailClient
      lead={lead as Lead}
      activities={(activities ?? []) as LeadActivity[]}
      enrichments={(enrichments ?? []) as EnrichmentRecord[]}
      stageName={stageName}
      scoringHistory={(scoringHistory ?? []) as ScoringHistoryRecord[]}
    />
  )
}
