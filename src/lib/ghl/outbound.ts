/**
 * GHL Outbound — sends approved outreach messages back through GoHighLevel.
 *
 * Design notes:
 * - Tenant-routed credentials. Each tenant has its own GHL sub-account
 *   (Exotiq vs MedSpa-Boulder). Credentials live in env vars; the tenant
 *   id picks which set we use.
 * - Rate limited to GHL's published 100 req / 10 sec ceiling. We use a
 *   simple in-process token bucket — fine for one Next.js node, will need
 *   moving to Upstash/Redis if we ever horizontally scale.
 * - Dry-run mode (GHL_OUTBOUND_DRY_RUN=true OR no API key configured)
 *   logs the request and returns a synthetic success. Production deploys
 *   should explicitly set GHL_OUTBOUND_DRY_RUN=false.
 *
 * The function is *only* called from the outreach queue PATCH handler when
 * a user clicks "Mark sent (GHL)". We never auto-send.
 */

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'
const MEDSPA_TENANT_ID = '11111111-1111-1111-1111-111111111111'

type GhlConfig = {
  apiKey: string
  locationId: string
  label: string
}

function configForTenant(tenantId: string): GhlConfig {
  if (tenantId === MEDSPA_TENANT_ID) {
    return {
      apiKey: process.env.GHL_MEDSPA_API_KEY ?? '',
      locationId: process.env.GHL_MEDSPA_LOCATION_ID ?? '',
      label: 'medspa',
    }
  }
  return {
    apiKey: process.env.GHL_API_KEY ?? '',
    locationId: process.env.GHL_LOCATION_ID ?? '',
    label: tenantId === DEFAULT_TENANT_ID ? 'exotiq' : `tenant:${tenantId.slice(0, 8)}`,
  }
}

// Channel → GHL messageType + endpoint mapping.
//
// GHL Conversations API supports SMS, Email, IG, FB, WhatsApp messageTypes.
// Instagram DM uses messageType "IG"; LinkedIn isn't a native GHL channel
// so we coerce it to a manual log + warning until you wire LinkedIn separately.
const CHANNEL_TO_GHL: Record<string, { messageType: string; supported: boolean }> = {
  instagram_dm: { messageType: 'IG', supported: true },
  email: { messageType: 'Email', supported: true },
  sms: { messageType: 'SMS', supported: true },
  phone: { messageType: 'Call', supported: false },
  linkedin_dm: { messageType: 'Custom', supported: false },
}

// Token bucket: 100 capacity, refills 10/sec.
const RATE_LIMIT = { capacity: 100, refillPerSec: 10 }
let tokens = RATE_LIMIT.capacity
let lastRefill = Date.now()

async function acquireToken(): Promise<void> {
  while (true) {
    const now = Date.now()
    const elapsed = (now - lastRefill) / 1000
    if (elapsed > 0) {
      tokens = Math.min(RATE_LIMIT.capacity, tokens + elapsed * RATE_LIMIT.refillPerSec)
      lastRefill = now
    }
    if (tokens >= 1) {
      tokens -= 1
      return
    }
    // Sleep until enough tokens accrue (worst case ~100ms).
    await new Promise((r) => setTimeout(r, 120))
  }
}

export type SendMessageInput = {
  tenantId: string
  ghlContactId: string | null
  channel: string
  body: string
  // Optional contact info used as a fallback when ghlContactId is null --
  // we'll create the GHL contact on the fly. Today the python ghl_poll
  // skill backfills ghl_contact_id whenever we see one inbound, so most
  // outbound calls will have it.
  email?: string | null
  phone?: string | null
  firstName?: string | null
  lastName?: string | null
  companyName?: string | null
}

export type SendMessageResult =
  | { ok: true; messageId: string; mode: 'live' | 'dry_run'; reason?: string }
  | { ok: false; error: string; status?: number; mode: 'live' | 'dry_run' }

export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const cfg = configForTenant(input.tenantId)
  const channelMap = CHANNEL_TO_GHL[input.channel] ?? null

  const dryRun =
    process.env.GHL_OUTBOUND_DRY_RUN === 'true' ||
    process.env.GHL_OUTBOUND_DRY_RUN === '1' ||
    !cfg.apiKey ||
    !cfg.locationId

  if (!channelMap || !channelMap.supported) {
    return {
      ok: false,
      error: `channel not supported by GHL outbound: ${input.channel}`,
      mode: dryRun ? 'dry_run' : 'live',
    }
  }

  if (dryRun) {
    console.info('[ghl-outbound][dry-run]', {
      tenant: cfg.label,
      contact: input.ghlContactId,
      channel: input.channel,
      messageType: channelMap.messageType,
      bodyPreview: input.body.slice(0, 80),
    })
    return {
      ok: true,
      messageId: `dryrun_${Date.now()}`,
      mode: 'dry_run',
      reason: !cfg.apiKey ? 'GHL_API_KEY not configured for tenant' : 'GHL_OUTBOUND_DRY_RUN=true',
    }
  }

  await acquireToken()

  // Resolve / create the GHL contact. If we have ghlContactId we use it;
  // otherwise look up by email or create.
  let contactId = input.ghlContactId
  if (!contactId) {
    const created = await ghlEnsureContact(cfg, input)
    if (!created.ok) return { ...created, mode: 'live' }
    contactId = created.contactId
  }

  // POST /conversations/messages — see GHL docs for payload shape.
  // https://highlevel.stoplight.io/docs/integrations/conversations
  const url = 'https://services.leadconnectorhq.com/conversations/messages'
  const payload: Record<string, unknown> = {
    type: channelMap.messageType,
    contactId,
    message: input.body,
  }
  // Email needs html / subject; we send plain-text body as html for now.
  if (channelMap.messageType === 'Email') {
    payload.html = `<p>${escapeHtml(input.body).replace(/\n/g, '<br/>')}</p>`
    payload.subject = (input.body.split(/\n/, 1)[0] || 'Hello').slice(0, 80)
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        Version: '2021-04-15',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      return {
        ok: false,
        error: typeof data.message === 'string' ? data.message : `GHL ${res.status}`,
        status: res.status,
        mode: 'live',
      }
    }
    const messageId =
      (data.messageId as string) ||
      (data.id as string) ||
      ((data.message as Record<string, unknown> | undefined)?.id as string) ||
      'unknown'
    return { ok: true, messageId, mode: 'live' }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'unknown error',
      mode: 'live',
    }
  }
}

async function ghlEnsureContact(
  cfg: GhlConfig,
  input: SendMessageInput,
): Promise<{ ok: true; contactId: string } | { ok: false; error: string; status?: number }> {
  const headers = {
    Authorization: `Bearer ${cfg.apiKey}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const lookupUrl = `https://services.leadconnectorhq.com/contacts/lookup?locationId=${encodeURIComponent(cfg.locationId)}${input.email ? `&email=${encodeURIComponent(input.email)}` : ''}${input.phone ? `&phone=${encodeURIComponent(input.phone)}` : ''}`
  const lookup = await fetch(lookupUrl, { headers })
  if (lookup.ok) {
    const j = (await lookup.json().catch(() => ({}))) as Record<string, unknown>
    const arr = (j.contacts as Array<{ id?: string }> | undefined) ?? []
    if (arr.length > 0 && arr[0].id) return { ok: true, contactId: arr[0].id }
  }

  // Create new contact.
  const create = await fetch('https://services.leadconnectorhq.com/contacts/', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      locationId: cfg.locationId,
      firstName: input.firstName ?? '',
      lastName: input.lastName ?? '',
      email: input.email ?? '',
      phone: input.phone ?? '',
      companyName: input.companyName ?? '',
      source: 'saul-leadgen-outbound',
    }),
  })
  const data = (await create.json().catch(() => ({}))) as Record<string, unknown>
  const contactId =
    (data.contact as Record<string, unknown> | undefined)?.id as string | undefined ||
    (data.id as string | undefined)
  if (!create.ok || !contactId) {
    return {
      ok: false,
      error: typeof data.message === 'string' ? data.message : `GHL contact create ${create.status}`,
      status: create.status,
    }
  }
  return { ok: true, contactId }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
