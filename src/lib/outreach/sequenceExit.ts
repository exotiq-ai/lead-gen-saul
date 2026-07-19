import type { SupabaseClient } from '@supabase/supabase-js'
import { shouldExitSequence } from '@/lib/exotiq/sequence'
import { addGhlTags, removeGhlTags, updateGhlSequenceState } from '@/lib/ghl/sequence'

export async function exitActiveSequences(
  supabase: SupabaseClient,
  input: { tenantId: string; leadId: string; eventType: string; source: string },
) {
  if (!shouldExitSequence(input.eventType)) return { exited: 0 }
  const now = new Date().toISOString()
  const { data: enrollments, error } = await supabase
    .from('outreach_sequence_enrollments')
    .select('id,ghl_contact_id')
    .eq('tenant_id', input.tenantId)
    .eq('lead_id', input.leadId)
    .eq('status', 'active')
  if (error) throw new Error(error.message)
  const rows = (enrollments || []) as Array<{ id: string; ghl_contact_id: string | null }>
  if (!rows.length) return { exited: 0 }

  for (const enrollment of rows) {
    await supabase
      .from('outreach_sequence_enrollments')
      .update({ status: 'exited', exit_reason: input.eventType, completed_at: now, next_action_at: null })
      .eq('id', enrollment.id)
      .eq('tenant_id', input.tenantId)
    await supabase
      .from('outreach_sequence_actions')
      .update({ status: 'cancelled', error_detail: `sequence_exit:${input.eventType}` })
      .eq('enrollment_id', enrollment.id)
      .eq('status', 'pending')

    if (enrollment.ghl_contact_id) {
      await removeGhlTags(enrollment.ghl_contact_id, ['exotiq-sequence-active']).catch(() => undefined)
      await addGhlTags(enrollment.ghl_contact_id, ['exotiq-sequence-engaged']).catch(() => undefined)
      await updateGhlSequenceState(enrollment.ghl_contact_id, {
        'Exotiq Sequence Status': 'exited',
        'Exotiq Sequence Exit Reason': input.eventType,
        'Exotiq Sequence Current Step': `exit:${input.eventType}`,
      }).catch(() => undefined)
    }
  }
  await supabase.from('lead_activities').insert({
    tenant_id: input.tenantId,
    lead_id: input.leadId,
    activity_type: 'sequence_exited',
    channel: 'automation',
    metadata: { event_type: input.eventType, source: input.source, enrollment_count: rows.length },
  })
  return { exited: rows.length }
}
