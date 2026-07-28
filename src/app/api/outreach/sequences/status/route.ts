import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireOutreachMutation } from '@/lib/outreach/serverAuth'
import { EXOTIQ_SEQUENCE_TENANT_ID } from '@/lib/ghl/sequence'
import { summarizeSequenceTracking } from '@/lib/exotiq/sequenceTracking'
import { buildSequenceDeliveryLedger, type SequenceLedgerAttempt, type SequenceLedgerEvent } from '@/lib/exotiq/sequenceLedger'
import { sequenceDailyEmailCap, utcDayWindow } from '@/lib/exotiq/sequence'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const auth = await requireOutreachMutation(req)
  if (!auth.ok) return auth.response
  const tenantId = req.nextUrl.searchParams.get('tenant_id') || EXOTIQ_SEQUENCE_TENANT_ID
  if (tenantId !== EXOTIQ_SEQUENCE_TENANT_ID) return NextResponse.json({ error: 'wrong tenant' }, { status: 400 })
  const supabase = createServerClient()
  const { data: enrollments, error } = await supabase
    .from('outreach_sequence_enrollments')
    .select('id,lead_id,sequence_key,sequence_version,mode,batch_key,route,status,current_step,next_action_at,ghl_contact_id,exit_reason,started_at,completed_at,leads(first_name,last_name,email,company_name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: actions, error: actionError } = await supabase
    .from('outreach_sequence_actions')
    .select('id,enrollment_id,step_key,step_ordinal,action_kind,label,due_at,status,provider,provider_action_id,error_detail,executed_at')
    .eq('tenant_id', tenantId)
    .order('due_at', { ascending: true })
    .limit(600)
  if (actionError) return NextResponse.json({ error: actionError.message }, { status: 500 })

  const enrollmentLeadIds = [...new Set((enrollments || []).map((row) => row.lead_id).filter(Boolean))]
  const trackedLeadIds = enrollmentLeadIds.length ? enrollmentLeadIds : ['00000000-0000-0000-0000-000000000000']
  const [attemptResult, eventResult, suppressionResult, quarantinedResult] = await Promise.all([
    supabase
      .from('outreach_send_attempts')
      .select('id,lead_id,sequence_step,mode,provider,status,subject,provider_message_id,error_detail,attempted_at,accepted_at,delivered_at,leads(first_name,last_name,email,company_name,ghl_contact_id)')
      .eq('tenant_id', tenantId)
      .in('lead_id', trackedLeadIds)
      .order('attempted_at', { ascending: false })
      .limit(600),
    supabase
      .from('outreach_events')
      .select('id,lead_id,send_attempt_id,provider,event_type,status,quarantine_reason,received_at,processed_at')
      .eq('tenant_id', tenantId)
      .in('lead_id', trackedLeadIds)
      .order('received_at', { ascending: false })
      .limit(1000),
    supabase
      .from('outreach_suppressions')
      .select('active')
      .eq('tenant_id', tenantId),
    supabase
      .from('outreach_events')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'quarantined'),
  ])
  const trackingError = attemptResult.error || eventResult.error || suppressionResult.error || quarantinedResult.error
  if (trackingError) return NextResponse.json({ error: trackingError.message }, { status: 500 })

  const demoLeadIds = new Set(
    (enrollments || [])
      .filter((row) => row.mode === 'demo')
      .map((row) => row.lead_id),
  )
  const rawAttempts = (attemptResult.data || []) as unknown as SequenceLedgerAttempt[]
  const attempts = rawAttempts.map((attempt) => ({
    ...attempt,
    mode: demoLeadIds.has(attempt.lead_id) ? 'demo' : attempt.mode,
  }))
  const events = (eventResult.data || []) as unknown as SequenceLedgerEvent[]
  const summary = summarizeSequenceTracking({
    enrollments: enrollments || [],
    actions: actions || [],
    attempts,
    events,
    suppressions: suppressionResult.data || [],
  })
  const ghlLocationId = process.env.GHL_EXOTIQ_LOCATION_ID || process.env.GHL_LOCATION_ID || ''
  const deliveryLedger = buildSequenceDeliveryLedger(attempts, events, ghlLocationId)
  const testCustomerEmail = (process.env.EXOTIQ_SEQUENCE_DEMO_EMAIL || '').trim().toLowerCase()
  const dailyWindow = utcDayWindow(new Date().toISOString())
  const countedStatuses = new Set(['attempting', 'provider_accepted', 'delivered', 'soft_bounced', 'hard_bounced', 'complained', 'ambiguous'])
  const liveEmailAttemptsToday = attempts.filter((attempt) => (
    attempt.mode === 'live'
    && Boolean(attempt.attempted_at)
    && String(attempt.attempted_at) >= dailyWindow.start
    && String(attempt.attempted_at) < dailyWindow.end
    && countedStatuses.has(attempt.status)
  )).length

  return NextResponse.json({
    summary,
    enrollments: enrollments || [],
    actions: actions || [],
    delivery_ledger: deliveryLedger,
    recent_events: events,
    customer_enrollment_enabled: process.env.EXOTIQ_CUSTOMER_SEQUENCE_ENROLLMENT_ENABLED === 'true',
    customer_sending_enabled: process.env.OUTREACH_LIVE_SENDS_ENABLED === 'true' && process.env.RESEND_OUTBOUND_DRY_RUN === 'false',
    demo_sending_enabled: process.env.EXOTIQ_SEQUENCE_DEMO_SEND_ENABLED === 'true',
    test_customer_email: testCustomerEmail || null,
    test_customer_configured: testCustomerEmail === 'gregory.ringler@gmail.com',
    daily_email_cap: sequenceDailyEmailCap(),
    live_email_attempts_today: liveEmailAttemptsToday,
    quarantined_events: quarantinedResult.count || 0,
  })
}
