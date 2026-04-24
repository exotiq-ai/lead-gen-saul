import { createServerClient } from '@/lib/supabase/server'
import { apolloProvider } from './apollo'
import type { LeadRow } from './provider'

export type TriggerEnrichmentResult = {
  ok: boolean
  enrichment_id?: string
  error?: string
  processed?: boolean
}

/**
 * Queues an Apollo enrichment for a lead and sets lead status to `enriching`.
 * When `process` is true, runs the Apollo provider in the same request.
 */
export async function triggerEnrichment(
  leadId: string,
  tenantId: string,
  options?: { process?: boolean },
): Promise<TriggerEnrichmentResult> {
  const supabase = createServerClient()

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select(
      'id, tenant_id, first_name, last_name, email, phone, company_name, company_domain, linkedin_url, status',
    )
    .eq('id', leadId)
    .eq('tenant_id', tenantId)
    .single()

  if (leadErr || !lead) {
    return { ok: false, error: leadErr?.message ?? 'Lead not found' }
  }

  const row = lead as LeadRow

  const { data: ins, error: insErr } = await supabase
    .from('enrichments')
    .insert({
      tenant_id: tenantId,
      lead_id: leadId,
      provider: 'apollo',
      status: 'pending',
      request_data: { source: 'triggerEnrichment' },
    })
    .select('id')
    .single()

  if (insErr || !ins) {
    return { ok: false, error: insErr?.message ?? 'Failed to insert enrichment' }
  }

  const { error: upErr } = await supabase
    .from('leads')
    .update({ status: 'enriching', updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('tenant_id', tenantId)

  if (upErr) {
    return { ok: false, error: upErr.message }
  }

  // Queue-only unless `process: true` (Saul can call again or use a worker)
  if (options?.process !== true) {
    return { ok: true, enrichment_id: ins.id, processed: false }
  }

  await apolloProvider.enrich(supabase, row, ins.id)

  return { ok: true, enrichment_id: ins.id, processed: true }
}
