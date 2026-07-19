import { createHash } from 'node:crypto'
import { DEFAULT_EXOTIQ_GTM_CONFIG } from '@/lib/exotiq/gtm/config'

export type SequenceEmailInput = {
  to: string
  subject: string
  text: string
  mode: 'demo' | 'live'
  idempotencyKey: string
}

export type SequenceEmailResult =
  | { ok: true; provider: 'resend'; messageId: string; payloadHash: string }
  | { ok: false; provider: 'resend'; error: string; status?: number; payloadHash: string }

function normalizedEmail(value: string) {
  return value.trim().toLowerCase()
}

export function canSendSequenceEmail(
  input: Pick<SequenceEmailInput, 'to' | 'mode'>,
  env: Record<string, string | undefined> = process.env,
) {
  const recipient = normalizedEmail(input.to)
  if (input.mode === 'demo') {
    const demoAddress = normalizedEmail(env.EXOTIQ_SEQUENCE_DEMO_EMAIL || '')
    return env.EXOTIQ_SEQUENCE_DEMO_SEND_ENABLED === 'true' && Boolean(demoAddress) && recipient === demoAddress
  }
  return env.OUTREACH_LIVE_SENDS_ENABLED === 'true' && env.RESEND_OUTBOUND_DRY_RUN === 'false'
}

function withRequiredFooter(text: string) {
  const footer = `\n\nGregory Ringler | Exotiq\n${DEFAULT_EXOTIQ_GTM_CONFIG.sender.physicalAddress}\nReply with "unsubscribe" and I will stop.`
  return `${text.trim()}${footer}`
}

export async function sendSequenceEmail(input: SequenceEmailInput): Promise<SequenceEmailResult> {
  const payloadText = withRequiredFooter(input.text)
  const payloadHash = createHash('sha256')
    .update(JSON.stringify({ to: normalizedEmail(input.to), subject: input.subject, text: payloadText }))
    .digest('hex')

  if (!canSendSequenceEmail(input)) {
    return { ok: false, provider: 'resend', error: 'sequence email sending is locked for this mode or recipient', payloadHash }
  }
  const apiKey = process.env.RESEND_API_KEY || ''
  if (!apiKey) return { ok: false, provider: 'resend', error: 'RESEND_API_KEY is not configured', payloadHash }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        from: `${DEFAULT_EXOTIQ_GTM_CONFIG.sender.fromName} <${DEFAULT_EXOTIQ_GTM_CONFIG.sender.sendingAddress}>`,
        reply_to: DEFAULT_EXOTIQ_GTM_CONFIG.sender.replyTo,
        to: [normalizedEmail(input.to)],
        subject: input.mode === 'demo' && !input.subject.startsWith('[DEMO]') ? `[DEMO] ${input.subject}` : input.subject,
        text: payloadText,
        tags: [
          { name: 'campaign', value: 'exotiq-founder-outreach-v1' },
          { name: 'mode', value: input.mode },
        ],
      }),
    })
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string }
    if (!response.ok || !body.id) {
      return { ok: false, provider: 'resend', error: body.message || `Resend HTTP ${response.status}`, status: response.status, payloadHash }
    }
    return { ok: true, provider: 'resend', messageId: body.id, payloadHash }
  } catch (error) {
    return { ok: false, provider: 'resend', error: error instanceof Error ? error.message : 'unknown Resend error', payloadHash }
  }
}
