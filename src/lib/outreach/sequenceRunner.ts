import type { SupabaseClient } from '@supabase/supabase-js'
import { createGhlNote, createGhlTaskIdempotent, getGhlContact, hasBlockingGhlOpportunity, isGhlContactSuppressed, addGhlTags, removeGhlTags, updateGhlSequenceState } from '@/lib/ghl/sequence'
import { sendSequenceEmail } from '@/lib/resend/sequenceSend'
import { sequenceDailyEmailCap, utcDayWindow } from '@/lib/exotiq/sequence'
import { exitActiveSequences } from '@/lib/outreach/sequenceExit'

const STEP_TAG: Record<string, string> = {
  email_1: 'exotiq-email-1-sent',
  call_1: 'exotiq-call-task-created',
  instagram_1: 'exotiq-instagram-task-created',
  email_2: 'exotiq-email-2-sent',
  email_3: 'exotiq-email-3-sent',
  email_close: 'exotiq-email-close-sent',
}

type DueAction = {
  id: string
  tenant_id: string
  enrollment_id: string
  lead_id: string
  queue_id: string | null
  step_key: string
  step_ordinal: number
  action_kind: 'email' | 'call_task' | 'instagram_task'
  label: string
  due_at: string
  idempotency_key: string
  attempt_count: number
  payload: Record<string, unknown>
  outreach_sequence_enrollments: {
    id: string
    mode: 'demo' | 'live'
    status: string
    ghl_contact_id: string | null
    campaign_version_id: string | null
  } | null
  leads: {
    email: string | null
    status: string | null
  } | null
}

async function markActionFailure(supabase: SupabaseClient, action: DueAction, error: string) {
  await supabase
    .from('outreach_sequence_actions')
    .update({ status: 'failed', error_detail: error.slice(0, 1000) })
    .eq('id', action.id)
  await supabase
    .from('outreach_sequence_enrollments')
    .update({ status: 'failed', exit_reason: `action_failed:${action.step_key}` })
    .eq('id', action.enrollment_id)
}

async function refreshEnrollment(supabase: SupabaseClient, action: DueAction, providerActionId: string) {
  const now = new Date().toISOString()
  await supabase
    .from('outreach_sequence_actions')
    .update({ status: 'completed', executed_at: now, provider_action_id: providerActionId, error_detail: null })
    .eq('id', action.id)

  const { data: next } = await supabase
    .from('outreach_sequence_actions')
    .select('due_at')
    .eq('enrollment_id', action.enrollment_id)
    .eq('status', 'pending')
    .order('step_ordinal', { ascending: true })
    .limit(1)
    .maybeSingle()
  const nextDue = (next as { due_at?: string } | null)?.due_at || null
  await supabase
    .from('outreach_sequence_enrollments')
    .update({
      current_step: action.step_ordinal,
      next_action_at: nextDue,
      ...(nextDue ? {} : { status: 'completed', completed_at: now }),
    })
    .eq('id', action.enrollment_id)

  const contactId = action.outreach_sequence_enrollments?.ghl_contact_id
  if (contactId) {
    await addGhlTags(contactId, [STEP_TAG[action.step_key]].filter(Boolean))
    if (!nextDue) await removeGhlTags(contactId, ['exotiq-sequence-active'])
    await updateGhlSequenceState(contactId, {
      'Exotiq Sequence Current Step': action.step_key,
      'Exotiq Sequence Status': nextDue ? 'active' : 'completed',
      'Exotiq Sequence Next Action At': nextDue || now,
    })
  }
}

async function actionExitReason(supabase: SupabaseClient, action: DueAction) {
  const email = action.leads?.email?.trim().toLowerCase() || ''
  const { count } = await supabase
    .from('outreach_suppressions')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', action.tenant_id)
    .eq('active', true)
    .or(`and(scope.eq.email,normalized_value.eq.${email}),and(scope.eq.lead,normalized_value.eq.${action.lead_id}),scope.eq.global`)
  if ((count || 0) > 0) return 'manual_suppression'
  const leadStatus = action.leads?.status || ''
  if (leadStatus === 'converted') return 'customer'
  if (['engaged', 'qualified'].includes(leadStatus)) return 'replied'
  if (['lost', 'disqualified'].includes(leadStatus)) return 'manual_suppression'
  const contactId = action.outreach_sequence_enrollments?.ghl_contact_id
  if (contactId) {
    const contact = await getGhlContact(contactId)
    if (isGhlContactSuppressed(contact)) return 'dnd'
    if (await hasBlockingGhlOpportunity(contactId)) return 'opportunity_opened'
  }
  return null
}

async function deferWhenDailyCapExceeded(supabase: SupabaseClient, action: DueAction, attemptId: string) {
  const now = new Date().toISOString()
  const cap = sequenceDailyEmailCap()
  const window = utcDayWindow(now)
  const { count, error } = await supabase
    .from('outreach_send_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', action.tenant_id)
    .eq('mode', 'live')
    .gte('attempted_at', window.start)
    .lt('attempted_at', window.end)
    .in('status', ['attempting', 'provider_accepted', 'delivered', 'soft_bounced', 'hard_bounced', 'complained', 'ambiguous'])
  if (error) throw new Error(error.message)
  if ((count || 0) <= cap) return null
  const { error: attemptError } = await supabase
    .from('outreach_send_attempts')
    .update({ status: 'cancelled', error_detail: `daily_email_cap_deferred:${cap}` })
    .eq('id', attemptId)
    .eq('tenant_id', action.tenant_id)
  if (attemptError) throw new Error(attemptError.message)
  const { error: actionError } = await supabase
    .from('outreach_sequence_actions')
    .update({ status: 'pending', due_at: window.end, error_detail: `daily_email_cap_deferred:${cap}` })
    .eq('id', action.id)
    .eq('tenant_id', action.tenant_id)
  if (actionError) throw new Error(actionError.message)
  const { error: enrollmentError } = await supabase
    .from('outreach_sequence_enrollments')
    .update({ next_action_at: window.end })
    .eq('id', action.enrollment_id)
    .eq('tenant_id', action.tenant_id)
  if (enrollmentError) throw new Error(enrollmentError.message)
  return { cap, resumeAt: window.end }
}

async function processAction(supabase: SupabaseClient, action: DueAction) {
  const enrollment = action.outreach_sequence_enrollments
  if (!enrollment || enrollment.status !== 'active') {
    await supabase.from('outreach_sequence_actions').update({ status: 'cancelled', error_detail: 'sequence_inactive_after_claim' }).eq('id', action.id)
    return { actionId: action.id, status: 'skipped_inactive' }
  }
  const exitReason = await actionExitReason(supabase, action)
  if (exitReason) {
    await exitActiveSequences(supabase, { tenantId: action.tenant_id, leadId: action.lead_id, eventType: exitReason, source: 'sequence_runner_preflight' })
    await supabase.from('outreach_sequence_actions').update({ status: 'cancelled', error_detail: `sequence_exit:${exitReason}` }).eq('id', action.id)
    return { actionId: action.id, status: 'exited_suppressed', reason: exitReason }
  }

  const contactId = enrollment.ghl_contact_id
  if (!contactId) throw new Error('sequence enrollment is missing GHL contact id')

  if (action.action_kind === 'email') {
    const email = action.leads?.email || ''
    const subject = String(action.payload.subject || '')
    const text = String(action.payload.text || '')
    const { data: existingAttempt } = await supabase
      .from('outreach_send_attempts')
      .select('id,status,provider_message_id')
      .eq('tenant_id', action.tenant_id)
      .eq('idempotency_key', action.idempotency_key)
      .maybeSingle()
    if ((existingAttempt as { status?: string } | null)?.status && !['failed', 'cancelled'].includes((existingAttempt as { status: string }).status)) {
      await refreshEnrollment(supabase, action, String((existingAttempt as { provider_message_id?: string }).provider_message_id || 'existing_attempt'))
      return { actionId: action.id, status: 'already_processed' }
    }

    const attemptPayload = {
      tenant_id: action.tenant_id,
      lead_id: action.lead_id,
      queue_id: action.queue_id,
      campaign_version_id: enrollment.campaign_version_id,
      sequence_step: action.step_ordinal,
      idempotency_key: action.idempotency_key,
      mode: 'live',
      provider: 'resend',
      status: 'attempting',
      sender_name: 'Gregory Ringler | Exotiq',
      sender_address: 'gregory@outreach.exotiq.ai',
      reply_to_address: 'hello@exotiq.ai',
      subject,
      attempted_at: new Date().toISOString(),
    }
    let attemptId = (existingAttempt as { id?: string } | null)?.id
    if (attemptId) {
      const { error: attemptUpdateError } = await supabase
        .from('outreach_send_attempts')
        .update(attemptPayload)
        .eq('id', attemptId)
        .eq('tenant_id', action.tenant_id)
      if (attemptUpdateError) throw new Error(attemptUpdateError.message)
    } else {
      const { data: created, error } = await supabase.from('outreach_send_attempts').insert(attemptPayload).select('id').single()
      if (error) throw new Error(error.message)
      attemptId = (created as { id: string }).id
    }

    if (enrollment.mode === 'live') {
      const deferred = await deferWhenDailyCapExceeded(supabase, action, attemptId)
      if (deferred) return { actionId: action.id, status: 'deferred_daily_cap', ...deferred }
    }

    const result = await sendSequenceEmail({ to: email, subject, text, mode: enrollment.mode, idempotencyKey: action.idempotency_key })
    if (!result.ok) {
      await supabase.from('outreach_send_attempts').update({ status: 'failed', error_detail: result.error, payload_hash: result.payloadHash }).eq('id', attemptId)
      throw new Error(result.error)
    }
    await supabase
      .from('outreach_send_attempts')
      .update({ status: 'provider_accepted', provider_message_id: result.messageId, payload_hash: result.payloadHash, accepted_at: new Date().toISOString() })
      .eq('id', attemptId)
    await createGhlNote(contactId, `[${enrollment.mode.toUpperCase()}] Exotiq sequence ${action.step_key} accepted by Resend. Message ID: ${result.messageId}`)
    if (action.queue_id && action.step_key === 'email_1') {
      await supabase.from('outreach_queue').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', action.queue_id)
      await supabase.from('leads').update({ first_contacted_at: new Date().toISOString(), status: 'outreach' }).eq('id', action.lead_id)
    }
    await refreshEnrollment(supabase, action, result.messageId)
    return { actionId: action.id, status: 'completed', provider: 'resend', providerActionId: result.messageId }
  }

  const title = String(action.payload.title || action.label)
  const body = String(action.payload.body || '')
  const task = await createGhlTaskIdempotent(
    contactId,
    { title, body, dueDate: new Date().toISOString() },
    action.idempotency_key,
  )
  if (task.created) {
    await createGhlNote(contactId, `[${enrollment.mode.toUpperCase()}] Exotiq sequence created ${action.action_kind} task ${task.id}.`)
  }
  await refreshEnrollment(supabase, action, task.id)
  return { actionId: action.id, status: task.created ? 'completed' : 'already_processed', provider: 'ghl_task', providerActionId: task.id }
}

export async function runDueSequenceActions(
  supabase: SupabaseClient,
  input: { tenantId: string; now?: string; enrollmentId?: string; demoFastForward?: boolean; limit?: number },
) {
  const now = input.now || new Date().toISOString()
  if (input.demoFastForward) {
    if (!input.enrollmentId) throw new Error('demo fast-forward requires an explicit enrollment id')
    const { data: enrollment, error: enrollmentError } = await supabase
      .from('outreach_sequence_enrollments')
      .select('mode')
      .eq('tenant_id', input.tenantId)
      .eq('id', input.enrollmentId)
      .maybeSingle()
    if (enrollmentError) throw new Error(enrollmentError.message)
    if ((enrollment as { mode?: string } | null)?.mode !== 'demo') throw new Error('fast-forward is restricted to demo enrollments')
  }

  let query = supabase
    .from('outreach_sequence_actions')
    .select('*, outreach_sequence_enrollments(id,mode,status,ghl_contact_id,campaign_version_id), leads(email,status)')
    .eq('tenant_id', input.tenantId)
    .eq('status', 'pending')
    .order('due_at', { ascending: true })
    .limit(Math.min(input.limit || 25, 100))
  if (input.enrollmentId) query = query.eq('enrollment_id', input.enrollmentId)
  if (!input.demoFastForward) query = query.lte('due_at', now)
  const { data: candidates, error } = await query
  if (error) throw new Error(error.message)

  const actions: DueAction[] = []
  for (const candidate of (candidates || []) as unknown as DueAction[]) {
    const { data: claimed, error: claimError } = await supabase
      .from('outreach_sequence_actions')
      .update({ status: 'processing', attempt_count: candidate.attempt_count + 1 })
      .eq('id', candidate.id)
      .eq('tenant_id', input.tenantId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (claimError) throw new Error(claimError.message)
    if (claimed) actions.push({ ...candidate, attempt_count: candidate.attempt_count + 1 })
  }
  const results: Array<Record<string, unknown>> = []
  for (const action of actions) {
    try {
      results.push(await processAction(supabase, action))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown sequence action failure'
      await markActionFailure(supabase, action, message)
      results.push({ actionId: action.id, status: 'failed', error: message })
      if (action.outreach_sequence_enrollments?.mode === 'demo') break
    }
  }
  return { processed: results.length, results }
}
