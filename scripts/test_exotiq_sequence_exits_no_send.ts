#!/usr/bin/env node
import { config as loadDotenv } from 'dotenv'
import { createServerClient } from '../src/lib/supabase/server'
import { EXOTIQ_SEQUENCE_TENANT_ID } from '../src/lib/ghl/sequence'
import { exitActiveSequences } from '../src/lib/outreach/sequenceExit'

loadDotenv({ path: '.env.local', override: true })
loadDotenv({ path: 'python-agent/.env', override: false })

const TEST_EMAIL = 'gregory.ringler@gmail.com'
const EXIT_EVENTS = [
  'replied',
  'unsubscribed',
  'hard_bounced',
  'complained',
  'dnd',
  'meeting_booked',
  'opportunity_opened',
  'customer',
  'manual_suppression',
] as const

function assertOutboundLocked() {
  const unsafe = [
    process.env.EXOTIQ_SEQUENCE_DEMO_SEND_ENABLED === 'true',
    process.env.EXOTIQ_CUSTOMER_SEQUENCE_ENROLLMENT_ENABLED === 'true',
    process.env.OUTREACH_LIVE_SENDS_ENABLED === 'true',
    process.env.RESEND_OUTBOUND_DRY_RUN === 'false',
  ].some(Boolean)
  if (unsafe) throw new Error('refusing no-send exit test because one or more outbound gates are unlocked')
}

async function main() {
  assertOutboundLocked()
  const supabase = createServerClient()
  const { data: leads, error: leadError } = await supabase
    .from('leads')
    .select('id,email')
    .eq('tenant_id', EXOTIQ_SEQUENCE_TENANT_ID)
    .ilike('email', TEST_EMAIL)
    .limit(1)
  if (leadError) throw new Error(leadError.message)
  const lead = (leads || [])[0] as { id?: string; email?: string } | undefined
  if (!lead?.id || lead.email?.trim().toLowerCase() !== TEST_EMAIL) throw new Error('allowlisted test customer was not resolved')
  const { count: preexistingActive, error: activeError } = await supabase
    .from('outreach_sequence_enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', EXOTIQ_SEQUENCE_TENANT_ID)
    .eq('lead_id', lead.id)
    .eq('status', 'active')
  if (activeError) throw new Error(activeError.message)
  if ((preexistingActive || 0) > 0) throw new Error('refusing exit test because the test customer already has an active sequence')

  const runKey = `no-send-exit-contract-${Date.now()}`
  const enrollmentIds: string[] = []
  const activityIds: string[] = []
  const results: Array<{ event: string; passed: boolean; enrollmentStatus?: string; actionStatus?: string }> = []

  try {
    for (const [index, event] of EXIT_EVENTS.entries()) {
      const batchKey = `${runKey}-${event}`
      const { data: enrollment, error: enrollmentError } = await supabase
        .from('outreach_sequence_enrollments')
        .insert({
          tenant_id: EXOTIQ_SEQUENCE_TENANT_ID,
          lead_id: lead.id,
          sequence_key: 'exotiq-no-send-exit-contract',
          sequence_version: 1,
          mode: 'demo',
          batch_key: batchKey,
          route: 'test_only',
          status: 'active',
          current_step: 0,
          next_action_at: new Date(Date.now() + 86_400_000).toISOString(),
          ghl_contact_id: null,
          metadata: { no_send_test: true, run_key: runKey, event },
        })
        .select('id')
        .single()
      if (enrollmentError) throw new Error(enrollmentError.message)
      const enrollmentId = String((enrollment as { id: string }).id)
      enrollmentIds.push(enrollmentId)

      const { error: actionError } = await supabase.from('outreach_sequence_actions').insert({
        tenant_id: EXOTIQ_SEQUENCE_TENANT_ID,
        enrollment_id: enrollmentId,
        lead_id: lead.id,
        step_key: 'email_1',
        step_ordinal: 1,
        action_kind: 'email',
        label: '[NO SEND TEST] exit contract',
        due_at: new Date(Date.now() + 86_400_000).toISOString(),
        status: 'pending',
        idempotency_key: `${runKey}:${index}:${event}`,
        payload: { no_send_test: true },
      })
      if (actionError) throw new Error(actionError.message)

      const exited = await exitActiveSequences(supabase, {
        tenantId: EXOTIQ_SEQUENCE_TENANT_ID,
        leadId: lead.id,
        eventType: event,
        source: runKey,
      })
      if (exited.exited !== 1) throw new Error(`${event}: expected one exited enrollment, got ${exited.exited}`)

      const [enrollmentReadback, actionReadback, activityReadback] = await Promise.all([
        supabase.from('outreach_sequence_enrollments').select('status,exit_reason').eq('id', enrollmentId).single(),
        supabase.from('outreach_sequence_actions').select('status,error_detail').eq('enrollment_id', enrollmentId).single(),
        supabase.from('lead_activities').select('id').eq('tenant_id', EXOTIQ_SEQUENCE_TENANT_ID).eq('lead_id', lead.id).eq('activity_type', 'sequence_exited').contains('metadata', { source: runKey, event_type: event }).order('created_at', { ascending: false }).limit(1),
      ])
      if (enrollmentReadback.error) throw new Error(enrollmentReadback.error.message)
      if (actionReadback.error) throw new Error(actionReadback.error.message)
      if (activityReadback.error) throw new Error(activityReadback.error.message)
      const enrollmentRow = enrollmentReadback.data as { status: string; exit_reason: string }
      const actionRow = actionReadback.data as { status: string; error_detail: string }
      const activityId = String(((activityReadback.data || [])[0] as { id?: string } | undefined)?.id || '')
      if (activityId) activityIds.push(activityId)
      const passed = enrollmentRow.status === 'exited'
        && enrollmentRow.exit_reason === event
        && actionRow.status === 'cancelled'
        && actionRow.error_detail === `sequence_exit:${event}`
        && Boolean(activityId)
      results.push({ event, passed, enrollmentStatus: enrollmentRow.status, actionStatus: actionRow.status })
      if (!passed) throw new Error(`${event}: exit contract readback failed`)
    }
  } finally {
    if (activityIds.length) await supabase.from('lead_activities').delete().in('id', activityIds)
    if (enrollmentIds.length) await supabase.from('outreach_sequence_enrollments').delete().in('id', enrollmentIds)
  }

  console.log(JSON.stringify({
    ok: results.every((row) => row.passed),
    no_email_sent: true,
    test_customer: TEST_EMAIL,
    exits_tested: results.length,
    results,
    cleanup: { enrollments_removed: enrollmentIds.length, activities_removed: activityIds.length },
  }, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, no_email_sent: true, error: error instanceof Error ? error.message : String(error) }))
  process.exit(1)
})
