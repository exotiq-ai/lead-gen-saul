import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { LOCAL_SERVICE_VERTICALS, LOCAL_SERVICES_TENANT_ID, type LocalServiceVerticalKey } from '@/lib/local-services/config'
import { sendSendblueMessage } from '@/lib/sendblue/client'

export const runtime = 'nodejs'

type SendblueWebhookPayload = {
  accountEmail?: string
  content?: string
  is_outbound?: boolean
  status?: string
  error_code?: number | null
  error_message?: string | null
  error_reason?: string | null
  error_detail?: string | null
  message_handle?: string
  date_sent?: string
  date_updated?: string
  from_number?: string
  number?: string
  to_number?: string
  was_downgraded?: boolean | null
  plan?: string
  media_url?: string
  message_type?: string
  group_id?: string
  participants?: string[]
  send_style?: string
  opted_out?: boolean
  sendblue_number?: string | null
  service?: string
  group_display_name?: string | null
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a)
  const bb = Buffer.from(b)
  return aa.length === bb.length && timingSafeEqual(aa, bb)
}

function verify(req: NextRequest) {
  const secret = process.env.SENDBLUE_WEBHOOK_SECRET
  if (!secret) return { ok: true }
  const provided = req.nextUrl.searchParams.get('secret') || req.headers.get('x-sendblue-webhook-secret') || ''
  if (!provided) return { ok: false, reason: 'missing webhook secret' }
  if (!safeEqual(provided, secret)) return { ok: false, reason: 'bad webhook secret' }
  return { ok: true }
}

function normalizePhone(raw: string | null | undefined) {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  if (raw.startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`
  return raw
}

function activityType(payload: SendblueWebhookPayload) {
  const status = (payload.status ?? '').toLowerCase()
  if (payload.opted_out) return 'opted_out'
  if (!payload.is_outbound || status === 'received') return 'sms_replied'
  if (status === 'delivered') return 'sms_delivered'
  if (status === 'sent' || status === 'accepted' || status === 'queued' || status === 'pending') return 'sms_sent'
  if (status === 'error' || status === 'declined') return 'sms_send_failed'
  return 'sendblue_event'
}

export async function POST(req: NextRequest) {
  const auth = verify(req)
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 })

  let payload: SendblueWebhookPayload
  try {
    payload = (await req.json()) as SendblueWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createServerClient()
  const tenantId = process.env.SENDBLUE_DEFAULT_TENANT_ID || LOCAL_SERVICES_TENANT_ID
  const contactPhone = normalizePhone(payload.number || (payload.is_outbound ? payload.to_number : payload.from_number))
  const sendblueNumber = normalizePhone(payload.sendblue_number || (payload.is_outbound ? payload.from_number : payload.to_number))

  let leadId: string | null = null
  if (contactPhone) {
    const { data } = await supabase
      .from('leads')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('phone', contactPhone)
      .maybeSingle()
    leadId = data?.id ?? null
  }

  if (!leadId && contactPhone && !payload.is_outbound) {
    const { data: created, error } = await supabase
      .from('leads')
      .insert({
        tenant_id: tenantId,
        phone: contactPhone,
        company_name: 'Sendblue inbound contact',
        source: 'api',
        source_detail: `sendblue:${payload.message_handle ?? 'inbound'}`,
        status: 'engaged',
        score: 0,
        score_breakdown: {
          local_services: true,
          source_provider: 'sendblue',
          sendblue_number: sendblueNumber,
          service: payload.service,
        },
        red_flags: [],
      })
      .select('id')
      .single()
    if (!error) leadId = created?.id ?? null
    else console.warn('[sendblue-webhook] lead insert failed:', error.message)
  }

  if (leadId) {
    const now = new Date().toISOString()
    const leadUpdate: Record<string, string> = {
      last_activity_at: now,
      updated_at: now,
    }
    if (!payload.is_outbound) leadUpdate.status = 'engaged'

    await supabase
      .from('leads')
      .update(leadUpdate)
      .eq('id', leadId)
      .eq('tenant_id', tenantId)

    await supabase.from('lead_activities').insert({
      tenant_id: tenantId,
      lead_id: leadId,
      activity_type: activityType(payload),
      channel: 'sendblue',
      metadata: {
        message_handle: payload.message_handle,
        status: payload.status,
        service: payload.service,
        is_outbound: payload.is_outbound,
        content: payload.content,
        media_url: payload.media_url,
        from_number: normalizePhone(payload.from_number),
        to_number: normalizePhone(payload.to_number),
        number: contactPhone,
        sendblue_number: sendblueNumber,
        was_downgraded: payload.was_downgraded,
        opted_out: payload.opted_out,
        error_code: payload.error_code,
        error_message: payload.error_message,
        error_reason: payload.error_reason,
        error_detail: payload.error_detail,
      },
    })

    if (!payload.is_outbound && isAffirmativeReply(payload.content)) {
      await sendAskSaulYesReply(supabase, tenantId, leadId, contactPhone, payload)
    }
  } else {
    console.warn('[sendblue-webhook] no lead resolved', { contactPhone, status: payload.status })
  }

  return NextResponse.json({ received: true, lead_id: leadId })
}
function isAffirmativeReply(content: string | undefined) {
  if (!content) return false
  const text = content.trim().toLowerCase()
  return /^(yes|yeah|yep|yup|sure|ok|okay|interested|send it|sounds good|call)$/i.test(text)
}

function render(template: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce((acc, [key, value]) => acc.replaceAll(`{${key}}`, value), template)
}

async function sendAskSaulYesReply(
  supabase: ReturnType<typeof createServerClient>,
  tenantId: string,
  leadId: string,
  contactPhone: string | null,
  payload: SendblueWebhookPayload,
) {
  if (!contactPhone) return
  const { data: lead, error } = await supabase
    .from('leads')
    .select('id, company_name, company_location, score_breakdown')
    .eq('tenant_id', tenantId)
    .eq('id', leadId)
    .maybeSingle()
  if (error || !lead) return

  const scoreBreakdown = (lead.score_breakdown ?? {}) as Record<string, unknown>
  if (scoreBreakdown.hold_phone_agent_outreach === true) return
  if (scoreBreakdown.project_key && scoreBreakdown.project_key !== 'ask_saul_phone_agents') return

  const verticalKey = (scoreBreakdown.vertical_key as LocalServiceVerticalKey | undefined) ?? 'hvac'
  const vertical = LOCAL_SERVICE_VERTICALS[verticalKey] ?? LOCAL_SERVICE_VERTICALS.hvac
  const city =
    typeof lead.company_location === 'string' && lead.company_location.trim()
      ? lead.company_location.split(',')[0]?.trim() || 'your area'
      : 'your area'
  const content = render(vertical.outreach.yesReply, {
    city,
    service_type: vertical.serviceType,
    company_name: typeof lead.company_name === 'string' ? lead.company_name : 'your company',
    demo_number: process.env.LOCAL_SERVICES_DEMO_NUMBER ?? process.env.SENDBLUE_FROM_NUMBER ?? '[demo number]',
  })

  const result = await sendSendblueMessage({
    number: contactPhone,
    content,
    statusCallback: publicStatusCallbackUrl(),
  })

  await supabase.from('lead_activities').insert({
    tenant_id: tenantId,
    lead_id: leadId,
    activity_type: result.ok ? 'sendblue_auto_yes_reply_sent' : 'sendblue_auto_yes_reply_failed',
    channel: 'sendblue',
    metadata: {
      trigger_message_handle: payload.message_handle,
      trigger_content: payload.content,
      reply_content: content,
      result,
    },
  })
}

function publicStatusCallbackUrl() {
  const base = process.env.SENDBLUE_WEBHOOK_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.URL
  if (!base) return undefined
  const url = new URL('/api/webhooks/sendblue', base)
  const secret = process.env.SENDBLUE_WEBHOOK_SECRET
  if (secret) url.searchParams.set('secret', secret)
  return url.toString()
}
