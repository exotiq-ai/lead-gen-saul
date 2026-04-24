import { createServerClient } from '@/lib/supabase/server'
import { calculateEngagement } from './engagement'
import { calculateIcpFitFromBreakdown, applyIcpProfileWeights, type IcpProfileCriteria } from './icp'
import { detectRedFlags } from './redflags'

function mapScoreToExotiqTier(total: number): 1 | 2 | 3 | 4 | 5 {
  if (total >= 80) return 5
  if (total >= 60) return 4
  if (total >= 40) return 3
  if (total >= 20) return 2
  return 1
}

function tierToAssigned(tier: 1 | 2 | 3 | 4 | 5): 'gregory' | 'team' | null {
  if (tier === 5) return 'gregory'
  if (tier === 1) return null
  return 'team'
}

/**
 * Master scoring: ICP (from breakdown) 70% + engagement 30% → 0–100 `score`,
 * updates `leads`, appends `scoring_history`.
 */
export async function calculateScore(leadId: string, tenantId: string) {
  const supabase = createServerClient()

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select(
      `
      id,
      tenant_id,
      status,
      score,
      score_breakdown,
      company_industry,
      company_name,
      email,
      last_activity_at,
      red_flags
    `,
    )
    .eq('id', leadId)
    .eq('tenant_id', tenantId)
    .single()

  if (leadErr || !lead) {
    return { ok: false as const, error: leadErr?.message ?? 'Lead not found' }
  }

  const { data: icpRow } = await supabase
    .from('icp_profiles')
    .select('criteria')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  const criteria = (icpRow?.criteria ?? null) as IcpProfileCriteria | null

  const breakdown =
    lead.score_breakdown && typeof lead.score_breakdown === 'object' && !Array.isArray(lead.score_breakdown)
      ? (lead.score_breakdown as Record<string, unknown>)
      : {}

  const { icp_fit, components } = calculateIcpFitFromBreakdown(breakdown)
  const blendedIcp = applyIcpProfileWeights(icp_fit, criteria)

  const { engagement } = await calculateEngagement(supabase, leadId, tenantId)

  const total = Math.min(
    100,
    Math.max(0, Math.round(blendedIcp * 0.7 + engagement * 0.3)),
  )

  const exotiq_tier = mapScoreToExotiqTier(total)
  const assigned = tierToAssigned(exotiq_tier)

  const flags = detectRedFlags({
    company_industry: lead.company_industry as string | null,
    company_name: lead.company_name as string | null,
    email: lead.email as string | null,
    last_activity_at: lead.last_activity_at as string | null,
    red_flags: lead.red_flags,
    score_breakdown: lead.score_breakdown,
  })

  const newBreakdown = {
    ...breakdown,
    ...components,
    exotiq_tier,
    icp_fit: blendedIcp,
    engagement_score_raw: engagement,
    composite: total,
  }

  const previous_score = lead.score as number | null

  const { error: upErr } = await supabase
    .from('leads')
    .update({
      score: total,
      icp_fit_score: blendedIcp,
      engagement_score: engagement,
      score_breakdown: newBreakdown,
      assigned_to: assigned,
      status: 'scored',
      red_flags: flags.map((code) => ({
        code,
        reason: 'auto-detected',
        flagged_at: new Date().toISOString(),
      })),
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    .eq('tenant_id', tenantId)

  if (upErr) {
    return { ok: false as const, error: upErr.message }
  }

  await supabase.from('scoring_history').insert({
    tenant_id: tenantId,
    lead_id: leadId,
    previous_score: previous_score,
    new_score: total,
    score_breakdown: newBreakdown,
    reason: 'TypeScript scoring engine',
    scored_by: 'saul_scoring_engine',
  })

  return {
    ok: true as const,
    score: total,
    icp_fit_score: blendedIcp,
    engagement_score: engagement,
    exotiq_tier,
    assigned_to: assigned,
  }
}
