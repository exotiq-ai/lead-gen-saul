import type { SupabaseClient } from '@supabase/supabase-js'

const MS_DAY = 24 * 60 * 60 * 1000

/**
 * 0–100 engagement from `lead_activities` — recency + touch volume.
 */
export async function calculateEngagement(
  supabase: SupabaseClient,
  leadId: string,
  tenantId: string,
): Promise<{ engagement: number; activity_count: number }> {
  const { data, error } = await supabase
    .from('lead_activities')
    .select('id, activity_type, created_at')
    .eq('lead_id', leadId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error || !data?.length) {
    return { engagement: 0, activity_count: 0 }
  }

  const now = Date.now()
  let score = 0
  for (const row of data) {
    const t = new Date((row as { created_at: string }).created_at).getTime()
    const days = (now - t) / MS_DAY
    const decay = days <= 1 ? 1 : days <= 7 ? 0.85 : days <= 30 ? 0.5 : 0.2
    const type = (row as { activity_type: string }).activity_type
    const typeWt =
      type === 'dm_replied' || type === 'form_submitted'
        ? 18
        : type === 'call_answered'
          ? 16
          : type === 'dm_opened' || type === 'dm_sent'
            ? 10
            : type === 'enriched' || type === 'score_changed'
              ? 6
              : 8
    score += typeWt * decay
  }

  const engagement = Math.min(100, Math.round(score))
  return { engagement, activity_count: data.length }
}
