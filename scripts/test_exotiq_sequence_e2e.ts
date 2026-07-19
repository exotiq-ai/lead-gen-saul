#!/usr/bin/env node
import 'dotenv/config'
import { config as loadDotenv } from 'dotenv'
import { createServerClient } from '../src/lib/supabase/server'
import { EXOTIQ_SEQUENCE_TENANT_ID, getGhlContact } from '../src/lib/ghl/sequence'
import { emailAttemptReachedProvider } from '../src/lib/exotiq/sequenceTracking'
import { enrollSequenceBatch } from '../src/lib/outreach/sequenceEnrollment'
import { runDueSequenceActions } from '../src/lib/outreach/sequenceRunner'

loadDotenv({ path: '.env.local', override: true })
loadDotenv({ path: 'python-agent/.env', override: false })

async function main() {
  const batchKey = process.argv[2] || `demo-${new Date().toISOString().slice(0, 10)}-v1`
  const supabase = createServerClient()
  const enrolled = await enrollSequenceBatch(supabase, {
    tenantId: EXOTIQ_SEQUENCE_TENANT_ID,
    mode: 'demo',
    batchKey,
    demoContact: {
      firstName: 'Gregory',
      lastName: 'Ringler',
      email: 'gregory.ringler@gmail.com',
      companyName: 'Exotiq Sequence Demo Customer',
    },
  })
  const enrollment = enrolled.results.find((row) => row.status === 'enrolled' || row.status === 'already_enrolled')
  const enrollmentId = String(enrollment?.enrollmentId || '')
  if (!enrollmentId) throw new Error(`demo enrollment failed: ${JSON.stringify(enrolled)}`)

  const run = await runDueSequenceActions(supabase, {
    tenantId: EXOTIQ_SEQUENCE_TENANT_ID,
    enrollmentId,
    demoFastForward: true,
    limit: 10,
  })

  const { data: enrollmentReadback, error: enrollmentError } = await supabase
    .from('outreach_sequence_enrollments')
    .select('id,status,current_step,next_action_at,ghl_contact_id,exit_reason,batch_key,mode')
    .eq('id', enrollmentId)
    .single()
  if (enrollmentError) throw new Error(enrollmentError.message)
  const { data: actions, error: actionError } = await supabase
    .from('outreach_sequence_actions')
    .select('step_key,action_kind,status,provider_action_id,error_detail,executed_at')
    .eq('enrollment_id', enrollmentId)
    .order('step_ordinal')
  if (actionError) throw new Error(actionError.message)
  const { data: attempts, error: attemptError } = await supabase
    .from('outreach_send_attempts')
    .select('sequence_step,provider,status,provider_message_id,error_detail')
    .eq('lead_id', String(enrollment?.leadId || ''))
    .eq('provider', 'resend')
    .order('sequence_step')
  if (attemptError) throw new Error(attemptError.message)

  const ghlContactId = String((enrollmentReadback as { ghl_contact_id?: string }).ghl_contact_id || '')
  const ghl = ghlContactId ? await getGhlContact(ghlContactId) : {}
  const actionRows = actions || []
  const passed =
    (enrollmentReadback as { status?: string }).status === 'completed' &&
    actionRows.length === 6 &&
    actionRows.every((action) => action.status === 'completed') &&
    (attempts || []).filter((attempt) => emailAttemptReachedProvider(attempt.status)).length >= 4

  console.log(JSON.stringify({
    ok: passed,
    batchKey,
    enrollment: enrollmentReadback,
    runner: run,
    actions: actionRows,
    emailAttempts: attempts,
    ghl: {
      contactId: ghlContactId,
      tags: ((ghl.tags || []) as unknown[]).map(String).filter((tag) => tag.includes('exotiq') || tag.includes('campaign:') || tag.includes('batch:')),
      dnd: Boolean(ghl.dnd),
    },
  }, null, 2))
  if (!passed) process.exitCode = 1
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }))
  process.exit(1)
})
