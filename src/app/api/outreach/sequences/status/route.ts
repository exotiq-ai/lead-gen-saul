import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireOutreachMutation } from '@/lib/outreach/serverAuth'
import { EXOTIQ_SEQUENCE_TENANT_ID } from '@/lib/ghl/sequence'
import { summarizeSequenceTracking } from '@/lib/exotiq/sequenceTracking'

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
  const [attemptResult, eventResult, suppressionResult] = await Promise.all([
    supabase
      .from('outreach_send_attempts')
      .select('status')
      .eq('tenant_id', tenantId)
      .in('lead_id', trackedLeadIds)
      .order('attempted_at', { ascending: false })
      .limit(600),
    supabase
      .from('outreach_events')
      .select('event_type,status')
      .eq('tenant_id', tenantId)
      .in('lead_id', trackedLeadIds)
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase
      .from('outreach_suppressions')
      .select('active')
      .eq('tenant_id', tenantId),
  ])
  const trackingError = attemptResult.error || eventResult.error || suppressionResult.error
  if (trackingError) return NextResponse.json({ error: trackingError.message }, { status: 500 })

  const summary = summarizeSequenceTracking({
    enrollments: enrollments || [],
    actions: actions || [],
    attempts: attemptResult.data || [],
    events: eventResult.data || [],
    suppressions: suppressionResult.data || [],
  })

  return NextResponse.json({
    summary,
    enrollments: enrollments || [],
    actions: actions || [],
    customer_enrollment_enabled: process.env.EXOTIQ_CUSTOMER_SEQUENCE_ENROLLMENT_ENABLED === 'true',
    customer_sending_enabled: process.env.OUTREACH_LIVE_SENDS_ENABLED === 'true' && process.env.RESEND_OUTBOUND_DRY_RUN === 'false',
    demo_sending_enabled: process.env.EXOTIQ_SEQUENCE_DEMO_SEND_ENABLED === 'true',
  })
}
