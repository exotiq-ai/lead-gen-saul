import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { createServerClient } from '@/lib/supabase/server'
import {
  classifyResendEvent,
  resendAttemptStatus,
  resendEventSuppresses,
} from '@/lib/resend/events'

export const runtime = 'nodejs'

const EXOTIQ_TENANT_ID = '00000000-0000-0000-0000-000000000001'

type ResendWebhookPayload = {
  type?: string
  created_at?: string
  data?: {
    email_id?: string
    from?: string
    to?: string[]
    subject?: string
    [key: string]: unknown
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET || ''
  if (!secret) return NextResponse.json({ error: 'Resend webhook is not configured' }, { status: 503 })

  const rawBody = await req.text()
  const svixId = req.headers.get('svix-id')
  const svixTimestamp = req.headers.get('svix-timestamp')
  const svixSignature = req.headers.get('svix-signature')
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Resend webhook signature' }, { status: 401 })
  }

  let payload: ResendWebhookPayload
  try {
    payload = new Webhook(secret).verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid Resend webhook signature' }, { status: 401 })
  }

  const supabase = createServerClient()
  const providerMessageId = payload.data?.email_id || null
  const canonicalType = classifyResendEvent(payload.type || 'unknown')

  const { data: existing } = await supabase
    .from('outreach_events')
    .select('id,status')
    .eq('tenant_id', EXOTIQ_TENANT_ID)
    .eq('provider', 'resend')
    .eq('provider_event_id', svixId)
    .maybeSingle()
  if (existing) return NextResponse.json({ received: true, status: 'duplicate' })

  const { data: attempt } = providerMessageId
    ? await supabase
        .from('outreach_send_attempts')
        .select('id,lead_id')
        .eq('tenant_id', EXOTIQ_TENANT_ID)
        .eq('provider', 'resend')
        .eq('provider_message_id', providerMessageId)
        .maybeSingle()
    : { data: null }

  const attemptRow = attempt as { id?: string; lead_id?: string } | null
  const eventStatus = attemptRow?.id ? 'processed' : 'quarantined'
  const quarantineReason = attemptRow?.id ? null : 'send_attempt_not_resolved'

  const { error: eventError } = await supabase.from('outreach_events').insert({
    tenant_id: EXOTIQ_TENANT_ID,
    lead_id: attemptRow?.lead_id || null,
    send_attempt_id: attemptRow?.id || null,
    provider: 'resend',
    provider_event_id: svixId,
    provider_message_id: providerMessageId,
    event_type: canonicalType,
    payload,
    status: eventStatus,
    quarantine_reason: quarantineReason,
    processed_at: attemptRow?.id ? new Date().toISOString() : null,
  })
  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 })

  if (!attemptRow?.id) {
    return NextResponse.json({ received: true, status: 'quarantined', reason: quarantineReason })
  }

  const nextAttemptStatus = resendAttemptStatus(canonicalType)
  if (nextAttemptStatus) {
    const patch: Record<string, unknown> = { status: nextAttemptStatus }
    if (canonicalType === 'delivered') patch.delivered_at = payload.created_at || new Date().toISOString()
    await supabase
      .from('outreach_send_attempts')
      .update(patch)
      .eq('id', attemptRow.id)
      .eq('tenant_id', EXOTIQ_TENANT_ID)
  }

  if (resendEventSuppresses(canonicalType)) {
    for (const recipient of payload.data?.to || []) {
      const normalized = recipient.trim().toLowerCase()
      if (!normalized) continue
      await supabase.from('outreach_suppressions').upsert(
        {
          tenant_id: EXOTIQ_TENANT_ID,
          scope: 'email',
          normalized_value: normalized,
          reason: canonicalType,
          source: 'resend_webhook',
          active: true,
          provider_event_id: svixId,
        },
        { onConflict: 'tenant_id,scope,normalized_value' },
      )
    }
  }

  await supabase.from('lead_activities').insert({
    tenant_id: EXOTIQ_TENANT_ID,
    lead_id: attemptRow.lead_id,
    activity_type: `resend_${canonicalType}`,
    channel: 'email',
    metadata: {
      provider_event_id: svixId,
      provider_message_id: providerMessageId,
      send_attempt_id: attemptRow.id,
    },
  })

  return NextResponse.json({ received: true, status: 'processed', event_type: canonicalType })
}
