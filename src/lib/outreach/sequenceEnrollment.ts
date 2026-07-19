import type { SupabaseClient } from '@supabase/supabase-js'
import { addGhlTags, createGhlNote, ensureGhlSequenceContact, updateGhlSequenceState } from '@/lib/ghl/sequence'
import {
  EXOTIQ_CUSTOMER_BATCH_LIMIT,
  EXOTIQ_SEQUENCE_KEY,
  EXOTIQ_SEQUENCE_VERSION,
  actionIdempotencyKey,
  scheduleSequence,
  sequenceEligibility,
  type ExotiqSequenceMode,
} from '@/lib/exotiq/sequence'
import { sequenceActionPayload } from '@/lib/exotiq/sequenceCopy'
import { DEFAULT_EXOTIQ_GTM_CONFIG } from '@/lib/exotiq/gtm/config'

export type DemoContactInput = {
  firstName: string
  lastName: string
  email: string
  companyName?: string
  phone?: string | null
}

type QueueLead = {
  id: string
  lead_id: string
  message_draft: string
  status: string
  route: string | null
  leads: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
    phone: string | null
    company_name: string | null
    company_location: string | null
    score: number | null
    status: string | null
    ghl_contact_id: string | null
    score_breakdown: Record<string, unknown> | null
  } | null
}

async function campaignVersion(supabase: SupabaseClient, tenantId: string) {
  const { data: existing } = await supabase
    .from('outreach_campaign_versions')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('campaign_key', EXOTIQ_SEQUENCE_KEY)
    .eq('version', EXOTIQ_SEQUENCE_VERSION)
    .maybeSingle()
  if ((existing as { id?: string } | null)?.id) return (existing as { id: string }).id
  const { data, error } = await supabase
    .from('outreach_campaign_versions')
    .insert({
      tenant_id: tenantId,
      campaign_key: EXOTIQ_SEQUENCE_KEY,
      version: EXOTIQ_SEQUENCE_VERSION,
      status: 'draft',
      audience: 'operator',
      market_country: 'US',
      offer: '15-minute founder call',
      sender_name: DEFAULT_EXOTIQ_GTM_CONFIG.sender.fromName,
      sender_address: DEFAULT_EXOTIQ_GTM_CONFIG.sender.sendingAddress,
      reply_to_address: DEFAULT_EXOTIQ_GTM_CONFIG.sender.replyTo,
      physical_address: DEFAULT_EXOTIQ_GTM_CONFIG.sender.physicalAddress,
      config: { customer_batch_limit: EXOTIQ_CUSTOMER_BATCH_LIMIT, tier_1_call_first: true, instagram_manual: true },
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return (data as { id: string }).id
}

async function ensureDemoQueue(supabase: SupabaseClient, tenantId: string, contact: DemoContactInput) {
  const email = contact.email.trim().toLowerCase()
  const { data: existingLeads } = await supabase
    .from('leads')
    .select('id')
    .eq('tenant_id', tenantId)
    .ilike('email', email)
    .limit(1)
  let leadId = ((existingLeads || [])[0] as { id?: string } | undefined)?.id
  if (!leadId) {
    const { data, error } = await supabase
      .from('leads')
      .insert({
        tenant_id: tenantId,
        first_name: contact.firstName,
        last_name: contact.lastName,
        email,
        phone: contact.phone || null,
        company_name: contact.companyName || 'Exotiq Sequence Demo Customer',
        company_location: 'Colorado, US',
        source: 'avi_sequence_demo',
        source_detail: 'authorized_gregory_ringler_end_to_end_test',
        score: 80,
        score_breakdown: { country_code: 'US', fleet_size: 12, company_ig_handle: '@driveexotiq', demo_contact: true },
        status: 'outreach',
        assigned_to: 'gregory',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    leadId = (data as { id: string }).id
  } else {
    await supabase
      .from('leads')
      .update({ first_name: contact.firstName, last_name: contact.lastName, phone: contact.phone || null, assigned_to: 'gregory' })
      .eq('id', leadId)
      .eq('tenant_id', tenantId)
  }

  const { data: existingQueue } = await supabase
    .from('outreach_queue')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .eq('channel', 'email')
    .in('status', ['pending', 'approved'])
    .limit(1)
  if (!((existingQueue || [])[0] as { id?: string } | undefined)?.id) {
    const { error } = await supabase.from('outreach_queue').insert({
      tenant_id: tenantId,
      lead_id: leadId,
      channel: 'email',
      message_draft: 'Subject: Exotiq sequence end-to-end test\n\nHey Gregory,\n\nThis approved copy is being used to verify the Exotiq automation from dashboard enrollment through email delivery, GHL tasks, CRM notes, and sequence completion.\n\nWorth comparing notes for 15 minutes?',
      status: 'approved',
      route: 'email_plus_ig',
      eligibility_reason: 'authorized_demo_contact',
      generated_by: 'avi:exotiq_sequence_demo_v1',
      reviewed_by: 'gregory',
      approved_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
  }
  return leadId
}

async function queueRows(supabase: SupabaseClient, tenantId: string, queueIds: string[]) {
  const { data, error } = await supabase
    .from('outreach_queue')
    .select('id,lead_id,message_draft,status,route,leads(id,first_name,last_name,email,phone,company_name,company_location,score,status,ghl_contact_id,score_breakdown)')
    .eq('tenant_id', tenantId)
    .in('id', queueIds)
  if (error) throw new Error(error.message)
  return (data || []) as unknown as QueueLead[]
}

export async function enrollSequenceBatch(
  supabase: SupabaseClient,
  input: {
    tenantId: string
    mode: ExotiqSequenceMode
    batchKey: string
    queueIds?: string[]
    demoContact?: DemoContactInput
    startedAt?: string
  },
) {
  if (input.mode === 'live' && process.env.EXOTIQ_CUSTOMER_SEQUENCE_ENROLLMENT_ENABLED !== 'true') {
    throw new Error('customer sequence enrollment is locked pending Gregory review')
  }
  let queueIds = input.queueIds || []
  if (input.mode === 'demo') {
    if (!input.demoContact) throw new Error('demo contact is required')
    const expected = (process.env.EXOTIQ_SEQUENCE_DEMO_EMAIL || '').trim().toLowerCase()
    if (!expected || input.demoContact.email.trim().toLowerCase() !== expected) throw new Error('demo contact email is not allowlisted')
    const leadId = await ensureDemoQueue(supabase, input.tenantId, input.demoContact)
    const { data } = await supabase
      .from('outreach_queue')
      .select('id')
      .eq('tenant_id', input.tenantId)
      .eq('lead_id', leadId)
      .eq('channel', 'email')
      .eq('status', 'approved')
      .limit(1)
    queueIds = [String(((data || [])[0] as { id?: string } | undefined)?.id || '')].filter(Boolean)
  }
  const uniqueIds = [...new Set(queueIds)]
  if (!uniqueIds.length) throw new Error('no queue items selected')
  if (uniqueIds.length > EXOTIQ_CUSTOMER_BATCH_LIMIT) throw new Error(`batch exceeds ${EXOTIQ_CUSTOMER_BATCH_LIMIT} contacts`)

  const campaignVersionId = await campaignVersion(supabase, input.tenantId)
  const rows = await queueRows(supabase, input.tenantId, uniqueIds)
  if (rows.length !== uniqueIds.length) throw new Error('one or more queue items were not found')
  const startedAt = input.startedAt || new Date().toISOString()
  const results: Array<Record<string, unknown>> = []

  for (const row of rows) {
    const lead = row.leads
    if (!lead) throw new Error(`queue ${row.id} has no lead`)
    const sb = lead.score_breakdown || {}
    const suppressed = Boolean((await supabase
      .from('outreach_suppressions')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', input.tenantId)
      .eq('active', true)
      .or(`and(scope.eq.email,normalized_value.eq.${(lead.email || '').toLowerCase()}),and(scope.eq.lead,normalized_value.eq.${lead.id}),scope.eq.global`)).count)
    const eligible = input.mode === 'demo'
      ? { eligible: true, reason: 'authorized_demo_contact' }
      : sequenceEligibility({
          countryCode: String(sb.country_code || sb.market_country || 'US'),
          route: row.route,
          score: lead.score,
          fleetSize: Number(sb.fleet_size || 0),
          email: lead.email,
          status: row.status,
          suppressed,
          customer: lead.status === 'converted',
        })
    if (!eligible.eligible) {
      results.push({ queueId: row.id, leadId: lead.id, status: 'held', reason: eligible.reason })
      continue
    }

    const contactId = await ensureGhlSequenceContact({
      id: lead.ghl_contact_id,
      firstName: lead.first_name || lead.company_name || 'Operator',
      lastName: lead.last_name || 'Lead',
      email: lead.email || '',
      phone: lead.phone,
      companyName: lead.company_name || 'Exotiq Operator',
    })
    await supabase.from('leads').update({ ghl_contact_id: contactId, ghl_last_sync: new Date().toISOString() }).eq('id', lead.id)

    const { data: existing } = await supabase
      .from('outreach_sequence_enrollments')
      .select('id,status')
      .eq('tenant_id', input.tenantId)
      .eq('lead_id', lead.id)
      .eq('sequence_key', EXOTIQ_SEQUENCE_KEY)
      .eq('sequence_version', EXOTIQ_SEQUENCE_VERSION)
      .eq('batch_key', input.batchKey)
      .maybeSingle()
    if ((existing as { id?: string } | null)?.id) {
      results.push({ queueId: row.id, leadId: lead.id, enrollmentId: (existing as { id: string }).id, status: 'already_enrolled' })
      continue
    }

    const schedule = scheduleSequence(startedAt, input.mode)
    const { data: enrollment, error: enrollmentError } = await supabase
      .from('outreach_sequence_enrollments')
      .insert({
        tenant_id: input.tenantId,
        lead_id: lead.id,
        campaign_version_id: campaignVersionId,
        sequence_key: EXOTIQ_SEQUENCE_KEY,
        sequence_version: EXOTIQ_SEQUENCE_VERSION,
        mode: input.mode,
        batch_key: input.batchKey,
        route: row.route || 'email_first',
        status: 'active',
        current_step: 0,
        next_action_at: schedule[0].dueAt,
        ghl_contact_id: contactId,
        metadata: { queue_id: row.id, eligibility_reason: eligible.reason, customer_send_gate: input.mode === 'live' },
        started_at: startedAt,
      })
      .select('id')
      .single()
    if (enrollmentError) throw new Error(enrollmentError.message)
    const enrollmentId = (enrollment as { id: string }).id
    const igHandle = String(sb.company_ig_handle || sb.ig_handle || '').replace(/^@/, '')
    const context = {
      firstName: lead.first_name,
      companyName: lead.company_name || 'Exotiq Operator',
      initialDraft: row.message_draft,
      mode: input.mode,
      instagramUrl: igHandle ? `https://www.instagram.com/${igHandle}/` : null,
      phone: lead.phone,
    }
    const actionRows = schedule.map((step) => ({
      tenant_id: input.tenantId,
      enrollment_id: enrollmentId,
      lead_id: lead.id,
      queue_id: step.key === 'email_1' ? row.id : null,
      step_key: step.key,
      step_ordinal: step.ordinal,
      action_kind: step.kind,
      label: step.label,
      due_at: step.dueAt,
      status: 'pending',
      idempotency_key: actionIdempotencyKey(enrollmentId, step.key),
      payload: sequenceActionPayload(step, context),
    }))
    const { error: actionError } = await supabase.from('outreach_sequence_actions').insert(actionRows)
    if (actionError) throw new Error(actionError.message)

    await addGhlTags(contactId, ['brand:exotiq', 'campaign:exotiq-founder-outreach-v1', 'exotiq-sequence-active', ...(input.mode === 'demo' ? ['batch:exotiq-sequence-demo'] : [])])
    await updateGhlSequenceState(contactId, {
      'Exotiq Sequence Key': `${EXOTIQ_SEQUENCE_KEY}:v${EXOTIQ_SEQUENCE_VERSION}`,
      'Exotiq Sequence Batch': input.batchKey,
      'Exotiq Sequence Status': 'active',
      'Exotiq Sequence Current Step': 'enrolled',
      'Exotiq Sequence Next Action At': schedule[0].dueAt,
      'Exotiq Sequence Sending Rail': 'resend',
    })
    await createGhlNote(contactId, `[${input.mode.toUpperCase()}] Enrolled in Exotiq founder outreach v${EXOTIQ_SEQUENCE_VERSION}. Batch: ${input.batchKey}. Customer sending remains independently gated.`)
    await supabase.from('lead_activities').insert({
      tenant_id: input.tenantId,
      lead_id: lead.id,
      activity_type: 'sequence_enrolled',
      channel: 'automation',
      metadata: { enrollment_id: enrollmentId, mode: input.mode, batch_key: input.batchKey, action_count: actionRows.length, ghl_contact_id: contactId },
    })
    results.push({ queueId: row.id, leadId: lead.id, enrollmentId, ghlContactId: contactId, status: 'enrolled', actionCount: actionRows.length })
  }
  return { requested: uniqueIds.length, results }
}
