const SENDBLUE_BASE_URL = 'https://api.sendblue.com'

export type SendblueConfig = {
  apiKeyId: string
  apiSecretKey: string
  fromNumber: string
}

export type SendblueMessageInput = {
  number: string
  content?: string
  mediaUrl?: string
  statusCallback?: string
  sendStyle?: string
  seatId?: string
}

export type SendblueMessageResult =
  | { ok: true; messageHandle: string | null; service: string | null; status: string | null; raw: Record<string, unknown> }
  | { ok: false; error: string; status?: number; raw?: unknown }

export function getSendblueConfig(): SendblueConfig {
  const apiKeyId = process.env.SENDBLUE_API_KEY_ID ?? ''
  const apiSecretKey = process.env.SENDBLUE_API_SECRET_KEY ?? ''
  const fromNumber = process.env.SENDBLUE_FROM_NUMBER ?? ''
  if (!apiKeyId || !apiSecretKey || !fromNumber) {
    throw new Error('SENDBLUE_API_KEY_ID, SENDBLUE_API_SECRET_KEY, and SENDBLUE_FROM_NUMBER are required')
  }
  return { apiKeyId, apiSecretKey, fromNumber }
}

function headers(cfg: SendblueConfig) {
  return {
    'sb-api-key-id': cfg.apiKeyId,
    'sb-api-secret-key': cfg.apiSecretKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

export async function listSendblueWebhooks(cfg = getSendblueConfig()) {
  const res = await fetch(`${SENDBLUE_BASE_URL}/api/account/webhooks`, {
    method: 'GET',
    headers: headers(cfg),
  })
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    return { ok: false as const, status: res.status, error: String(raw.message ?? raw.error ?? `Sendblue ${res.status}`), raw }
  }
  return { ok: true as const, raw }
}

export async function addSendblueWebhook(type: 'receive' | 'outbound' | 'typing_indicator' | 'call_log' | 'line_blocked' | 'line_assigned' | 'contact_created', webhook: string | { url: string; secret?: string }, cfg = getSendblueConfig()) {
  const res = await fetch(`${SENDBLUE_BASE_URL}/api/account/webhooks`, {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify({ type, webhooks: [webhook] }),
  })
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    return { ok: false as const, status: res.status, error: String(raw.message ?? raw.error ?? `Sendblue ${res.status}`), raw }
  }
  return { ok: true as const, raw }
}

export async function evaluateSendblueService(number: string, cfg = getSendblueConfig()) {
  const url = new URL(`${SENDBLUE_BASE_URL}/api/evaluate-service`)
  url.searchParams.set('number', number)
  const res = await fetch(url, { method: 'GET', headers: headers(cfg) })
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    return { ok: false as const, status: res.status, error: String(raw.message ?? raw.error ?? `Sendblue ${res.status}`), raw }
  }
  return { ok: true as const, raw }
}

export async function sendSendblueMessage(input: SendblueMessageInput, cfg = getSendblueConfig()): Promise<SendblueMessageResult> {
  if (!input.content && !input.mediaUrl) return { ok: false, error: 'content or mediaUrl is required' }
  const res = await fetch(`${SENDBLUE_BASE_URL}/api/send-message`, {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify({
      number: input.number,
      from_number: cfg.fromNumber,
      content: input.content,
      media_url: input.mediaUrl,
      status_callback: input.statusCallback,
      send_style: input.sendStyle,
      seat_id: input.seatId,
    }),
  })
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    return { ok: false, status: res.status, error: String(raw.message ?? raw.error ?? `Sendblue ${res.status}`), raw }
  }
  return {
    ok: true,
    messageHandle: typeof raw.message_handle === 'string' ? raw.message_handle : null,
    service: typeof raw.service === 'string' ? raw.service : null,
    status: typeof raw.status === 'string' ? raw.status : null,
    raw,
  }
}
