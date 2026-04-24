import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function verifySignature(rawBody: string, req: NextRequest): { ok: boolean; reason?: string } {
  if (process.env.GHL_SKIP_SIGNATURE === 'true') {
    return { ok: true }
  }

  const secret = process.env.GHL_WEBHOOK_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'development') {
      return { ok: true }
    }
    return { ok: false, reason: 'GHL_WEBHOOK_SECRET not configured' }
  }

  const sig = req.headers.get('x-saul-hmac') || req.headers.get('X-Saul-Hmac')
  if (!sig) {
    return { ok: false, reason: 'Missing X-Saul-Hmac header' }
  }

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const got = sig.replace(/^sha256=/i, '').trim()
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(got, 'utf8')
  if (a.length !== b.length) {
    return { ok: false, reason: 'Bad signature' }
  }
  if (!timingSafeEqual(a, b)) {
    return { ok: false, reason: 'Bad signature' }
  }
  return { ok: true }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const v = verifySignature(rawBody, req)
  if (!v.ok) {
    return NextResponse.json({ error: v.reason ?? 'Unauthorized' }, { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  void processGhlPayload(payload)

  return NextResponse.json({ received: true })
}

async function processGhlPayload(payload: Record<string, unknown>) {
  const supabase = createServerClient()
  const tenantId = process.env.GHL_DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001'

  const type = (payload.type as string) || (payload.event as string) || (payload['Event-Name'] as string) || 'unknown'
  const contact = (payload.contact as Record<string, unknown> | undefined) || {}
  const email = (typeof contact.email === 'string' ? contact.email : null) || (typeof payload.email === 'string' ? payload.email : null)
  const ghlId = (typeof contact.id === 'string' ? contact.id : null) || (typeof payload.contactId === 'string' ? payload.contactId : null)
  const firstName = (typeof contact.firstName === 'string' && contact.firstName) || (typeof contact.first_name === 'string' && contact.first_name) || 'Contact'
  const lastName = (typeof contact.lastName === 'string' && contact.lastName) || (typeof contact.last_name === 'string' && contact.last_name) || ''
  const company =
    (typeof contact.companyName === 'string' && contact.companyName) ||
    (typeof (contact as { name?: string }).name === 'string' && (contact as { name?: string }).name) ||
    'Unknown'

  let leadId: string | null = null

  if (ghlId) {
    const { data: byGhl } = await supabase
      .from('leads')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('ghl_contact_id', ghlId)
      .maybeSingle()
    if (byGhl) leadId = (byGhl as { id: string }).id
  }
  if (!leadId && email) {
    const { data: byEmail } = await supabase
      .from('leads')
      .select('id')
      .eq('tenant_id', tenantId)
      .ilike('email', email)
      .maybeSingle()
    if (byEmail) leadId = (byEmail as { id: string }).id
  }

  if (!leadId && (email || ghlId)) {
    const { data: created, error } = await supabase
      .from('leads')
      .insert({
        tenant_id: tenantId,
        first_name: firstName,
        last_name: lastName,
        email,
        company_name: company,
        source: 'api',
        source_detail: 'ghl_webhook',
        status: 'engaged',
        ghl_contact_id: ghlId,
        ghl_last_sync: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (!error && created) {
      leadId = (created as { id: string }).id
    } else {
      console.warn('[ghl-webhook] lead insert failed:', error?.message)
    }
  }

  if (!leadId) {
    console.warn('[ghl-webhook] no lead resolved; skipping activity')
    return
  }

  await supabase
    .from('leads')
    .update({
      last_activity_at: new Date().toISOString(),
      ghl_last_sync: new Date().toISOString(),
      ghl_contact_id: ghlId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    .eq('tenant_id', tenantId)

  await supabase.from('lead_activities').insert({
    tenant_id: tenantId,
    lead_id: leadId,
    activity_type: mapGhlTypeToActivity(String(type)),
    channel: 'ghl',
    metadata: { ghl_type: type, contact_id: ghlId, email },
  })
}

function mapGhlTypeToActivity(t: string): string {
  const x = t.toLowerCase()
  if (x.includes('reply') || x.includes('inbound') || x.includes('sms_inbound')) return 'dm_replied'
  if (x.includes('email') && x.includes('open')) return 'dm_opened'
  if (x.includes('email')) return 'dm_replied'
  if (x.includes('call')) return 'call_made'
  if (x.includes('submit')) return 'form_submitted'
  return 'form_submitted'
}
