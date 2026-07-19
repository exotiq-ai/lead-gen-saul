import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import {
  classifyGhlEvent,
  extractGhlEventIdentity,
  sequenceExitEventFromGhl,
  shouldSuppressForEvent,
  verifyGhlWebhookSignature,
  type CanonicalGhlEventType,
} from '@/lib/ghl/events'
import { exitActiveSequences } from '@/lib/outreach/sequenceExit'

export const runtime = 'nodejs'

type SupabaseLike = ReturnType<typeof createServerClient>

function eventType(payload: Record<string, unknown>) {
  return String(payload.type || payload.event || payload['Event-Name'] || 'unknown')
}

function expectedLocationId() {
  return process.env.GHL_EXOTIQ_WEBHOOK_LOCATION_ID || process.env.GHL_EXOTIQ_LOCATION_ID || process.env.GHL_LOCATION_ID || ''
}

function verifySignature(rawBody: string, req: NextRequest): { ok: boolean; reason?: string } {
  if (process.env.NODE_ENV === 'development' && process.env.GHL_SKIP_SIGNATURE === 'true') return { ok: true }

  const publicKey = process.env.GHL_WEBHOOK_PUBLIC_KEY || `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`
  const sig = req.headers.get('x-ghl-signature')
  const verified = verifyGhlWebhookSignature(rawBody, sig, publicKey)
  return verified.ok ? { ok: true } : { ok: false, reason: verified.reason }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const sig = verifySignature(rawBody, req)
  if (!sig.ok) return NextResponse.json({ error: sig.reason ?? 'Unauthorized' }, { status: 401 })

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const result = await processGhlPayload(payload)
  return NextResponse.json(result)
}

async function quarantineEvent(
  supabase: SupabaseLike,
  tenantId: string,
  providerEventId: string,
  eventTypeValue: CanonicalGhlEventType,
  payload: Record<string, unknown>,
  reason: string,
  providerMessageId?: string | null,
) {
  await supabase.from('outreach_events').upsert(
    {
      tenant_id: tenantId,
      provider: 'ghl',
      provider_event_id: providerEventId,
      provider_message_id: providerMessageId,
      event_type: eventTypeValue,
      payload,
      status: 'quarantined',
      quarantine_reason: reason,
    },
    { onConflict: 'tenant_id,provider,provider_event_id' },
  )
  return { received: true, status: 'quarantined', reason }
}

async function processGhlPayload(payload: Record<string, unknown>) {
  const supabase = createServerClient()
  const tenantId = process.env.GHL_DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001'
  const expectedLocation = expectedLocationId()
  const identity = extractGhlEventIdentity(payload)
  const canonicalType = classifyGhlEvent(eventType(payload))
  const providerEventId = identity.eventId || `${identity.contactId || 'unknown'}:${eventType(payload)}:${Date.now()}`
  const providerMessageId = typeof payload.messageId === 'string' ? payload.messageId : null

  if (!expectedLocation) {
    return quarantineEvent(supabase, tenantId, providerEventId, canonicalType, payload, 'missing_expected_location', providerMessageId)
  }
  if (!identity.locationId || identity.locationId !== expectedLocation) {
    return quarantineEvent(supabase, tenantId, providerEventId, canonicalType, payload, 'wrong_or_missing_location', providerMessageId)
  }

  const { data: existing } = await supabase
    .from('outreach_events')
    .select('id,status')
    .eq('tenant_id', tenantId)
    .eq('provider', 'ghl')
    .eq('provider_event_id', providerEventId)
    .maybeSingle()
  if (existing) return { received: true, status: 'duplicate' }

  let leadId: string | null = null
  if (identity.contactId) {
    const { data } = await supabase
      .from('leads')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('ghl_contact_id', identity.contactId)
      .maybeSingle()
    leadId = (data as { id?: string } | null)?.id || null
  }
  if (!leadId && identity.email) {
    const { data } = await supabase
      .from('leads')
      .select('id')
      .eq('tenant_id', tenantId)
      .ilike('email', identity.email)
      .maybeSingle()
    leadId = (data as { id?: string } | null)?.id || null
  }

  if (!leadId) {
    return quarantineEvent(supabase, tenantId, providerEventId, canonicalType, payload, 'lead_not_resolved', providerMessageId)
  }

  const { data: sendAttempt } = providerMessageId
    ? await supabase
        .from('outreach_send_attempts')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('provider', 'ghl')
        .eq('provider_message_id', providerMessageId)
        .maybeSingle()
    : { data: null }

  const { data: eventRow } = await supabase
    .from('outreach_events')
    .insert({
      tenant_id: tenantId,
      lead_id: leadId,
      send_attempt_id: (sendAttempt as { id?: string } | null)?.id || null,
      provider: 'ghl',
      provider_event_id: providerEventId,
      provider_message_id: providerMessageId,
      event_type: canonicalType,
      payload,
      status: 'received',
    })
    .select('id')
    .single()

  if (shouldSuppressForEvent(canonicalType) && identity.email) {
    await supabase.from('outreach_suppressions').upsert(
      {
        tenant_id: tenantId,
        scope: 'email',
        normalized_value: identity.email,
        reason: canonicalType,
        source: 'ghl_webhook',
        active: true,
        provider_event_id: providerEventId,
      },
      { onConflict: 'tenant_id,scope,normalized_value' },
    )
  }

  await supabase.from('lead_activities').insert({
    tenant_id: tenantId,
    lead_id: leadId,
    activity_type: `ghl_${canonicalType}`,
    channel: 'ghl',
    metadata: { provider_event_id: providerEventId, provider_message_id: providerMessageId, event_id: (eventRow as { id?: string } | null)?.id },
  })

  const sequenceExitEvent = sequenceExitEventFromGhl(canonicalType)
  if (sequenceExitEvent) {
    await exitActiveSequences(supabase, {
      tenantId,
      leadId,
      eventType: sequenceExitEvent,
      source: 'ghl_webhook',
    })
  }

  await supabase
    .from('outreach_events')
    .update({ status: 'processed', processed_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('provider', 'ghl')
    .eq('provider_event_id', providerEventId)

  return { received: true, status: 'processed', event_type: canonicalType }
}
