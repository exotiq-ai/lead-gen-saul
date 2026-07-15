import { timingSafeEqual } from 'node:crypto'

export type MutationGateConfig = {
  enabled: boolean
  token: string
  actor?: string
}

export type MutationAuthorization =
  | { ok: true; actor: string }
  | { ok: false; status: 401 | 503; reason: string }

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8')
  const b = Buffer.from(right, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function authorizeOutreachMutation(
  suppliedToken: string | null,
  config: MutationGateConfig,
): MutationAuthorization {
  if (!config.enabled) {
    return { ok: false, status: 503, reason: 'outreach_mutations_disabled' }
  }
  if (!config.token) {
    return { ok: false, status: 503, reason: 'outreach_mutations_not_configured' }
  }
  if (!suppliedToken || !constantTimeEqual(suppliedToken, config.token)) {
    return { ok: false, status: 401, reason: 'unauthorized_outreach_mutation' }
  }
  return { ok: true, actor: config.actor || 'gregory' }
}

export type SendTransitionInput = {
  mode: 'live' | 'dry_run'
  provider: string
  messageId: string
  channel: string
  now: string
}

export function buildSendStateTransition(input: SendTransitionInput) {
  if (input.mode === 'dry_run') {
    return {
      queuePatch: {},
      activityType: `${input.channel}_send_dry_run`,
      canonicalSent: false,
    }
  }

  return {
    queuePatch: {
      status: 'sent',
      sent_at: input.now,
    },
    activityType:
      input.channel === 'email'
        ? 'email_sent'
        : input.channel === 'sms'
          ? 'sms_sent'
          : 'dm_sent',
    canonicalSent: true,
  }
}
