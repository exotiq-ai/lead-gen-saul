const GHL_BASE = 'https://services.leadconnectorhq.com'
const EXOTIQ_TENANT_ID = '00000000-0000-0000-0000-000000000001'

function config() {
  const apiKey = process.env.GHL_EXOTIQ_API_KEY || process.env.GHL_API_KEY || ''
  const locationId = process.env.GHL_EXOTIQ_LOCATION_ID || process.env.GHL_LOCATION_ID || ''
  if (!apiKey || !locationId) throw new Error('Exotiq GHL credentials are not configured')
  return { apiKey, locationId }
}

function headers() {
  const { apiKey } = config()
  return {
    Authorization: `Bearer ${apiKey}`,
    Version: '2021-07-28',
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 Chrome/126 Safari/537.36',
    Origin: 'https://app.gohighlevel.com',
    Referer: 'https://app.gohighlevel.com/',
  }
}

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${GHL_BASE}${path}`, { ...init, headers: { ...headers(), ...(init.headers || {}) } })
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) throw new Error(`GHL ${response.status}: ${String(body.message || body.error || 'request failed')}`)
  return body
}

export type GhlSequenceContact = {
  id?: string | null
  firstName: string
  lastName: string
  email: string
  companyName: string
  phone?: string | null
}

export async function verifyExotiqLocation() {
  const { locationId } = config()
  const data = await request(`/locations/${locationId}`)
  const location = (data.location || data) as Record<string, unknown>
  if (location.name !== 'Exotiq Inc.') throw new Error(`wrong GHL location: ${String(location.name || 'unknown')}`)
  return { locationId, name: String(location.name) }
}

export async function ensureGhlSequenceContact(input: GhlSequenceContact) {
  const { locationId } = config()
  await verifyExotiqLocation()
  const data = await request('/contacts/upsert', {
    method: 'POST',
    body: JSON.stringify({
      locationId,
      firstName: input.firstName,
      lastName: input.lastName,
      name: `${input.firstName} ${input.lastName}`.trim(),
      email: input.email.trim().toLowerCase(),
      ...(input.phone ? { phone: input.phone } : {}),
      companyName: input.companyName,
      source: 'Exotiq API-first sequence automation',
      tags: ['brand:exotiq', 'campaign:exotiq-founder-outreach-v1'],
    }),
  })
  const contact = (data.contact || data) as Record<string, unknown>
  if (!contact.id) throw new Error('GHL contact upsert did not return an id')
  return String(contact.id)
}

async function sequenceFieldIds() {
  const { locationId } = config()
  const data = await request(`/locations/${locationId}/customFields`)
  const fields = (data.customFields || []) as Array<Record<string, unknown>>
  return new Map(fields.map((field) => [String(field.name || ''), String(field.id || '')]))
}

export async function updateGhlSequenceState(contactId: string, values: Record<string, string | null | undefined>) {
  const ids = await sequenceFieldIds()
  const customFields = Object.entries(values)
    .filter(([, value]) => value != null && value !== '')
    .map(([name, value]) => {
      const id = ids.get(name)
      if (!id) throw new Error(`missing GHL sequence field: ${name}`)
      return { id, field_value: value }
    })
  await request(`/contacts/${contactId}`, { method: 'PUT', body: JSON.stringify({ customFields }) })
}

export async function addGhlTags(contactId: string, tags: string[]) {
  if (!tags.length) return
  await request(`/contacts/${contactId}/tags`, { method: 'POST', body: JSON.stringify({ tags }) })
}

export async function removeGhlTags(contactId: string, tags: string[]) {
  if (!tags.length) return
  await request(`/contacts/${contactId}/tags`, { method: 'DELETE', body: JSON.stringify({ tags }) })
}

export async function createGhlTask(contactId: string, input: { title: string; body: string; dueDate: string }) {
  const data = await request(`/contacts/${contactId}/tasks`, { method: 'POST', body: JSON.stringify({ ...input, completed: false }) })
  const task = (data.task || data) as Record<string, unknown>
  if (!task.id) throw new Error('GHL task create did not return an id')
  return String(task.id)
}

export function ghlTaskIdempotencyMarker(idempotencyKey: string) {
  return `[Exotiq action: ${idempotencyKey.trim()}]`
}

export async function createGhlTaskIdempotent(
  contactId: string,
  input: { title: string; body: string; dueDate: string },
  idempotencyKey: string,
) {
  const marker = ghlTaskIdempotencyMarker(idempotencyKey)
  const existingData = await request(`/contacts/${contactId}/tasks`)
  const existingTasks = (existingData.tasks || []) as Array<Record<string, unknown>>
  const existing = existingTasks.find((task) => String(task.body || '').includes(marker))
  if (existing?.id) return { id: String(existing.id), created: false }
  const id = await createGhlTask(contactId, { ...input, body: `${input.body.trim()}\n\n${marker}` })
  return { id, created: true }
}

export async function createGhlNote(contactId: string, body: string) {
  const data = await request(`/contacts/${contactId}/notes`, { method: 'POST', body: JSON.stringify({ body }) })
  const note = (data.note || data) as Record<string, unknown>
  return note.id ? String(note.id) : null
}

export async function getGhlContact(contactId: string) {
  const data = await request(`/contacts/${contactId}`)
  return (data.contact || data) as Record<string, unknown>
}

export function opportunityBlocksSequence(status: unknown) {
  const normalized = String(status || '').trim().toLowerCase()
  return normalized === 'open' || normalized === 'won'
}

export async function hasBlockingGhlOpportunity(contactId: string) {
  const { locationId } = config()
  const params = new URLSearchParams({ location_id: locationId, contact_id: contactId, limit: '20' })
  const data = await request(`/opportunities/search?${params.toString()}`)
  const opportunities = (data.opportunities || []) as Array<Record<string, unknown>>
  return opportunities.some((opportunity) => opportunityBlocksSequence(opportunity.status))
}

export function isGhlContactSuppressed(contact: Record<string, unknown>) {
  const dnd = contact.dnd === true
  const dndSettings = (contact.dndSettings || {}) as Record<string, unknown>
  const emailDnd = Object.entries(dndSettings).some(([key, value]) => key.toLowerCase().includes('email') && Boolean(value))
  const tags = ((contact.tags || []) as unknown[]).map(String).map((tag) => tag.toLowerCase())
  return dnd || emailDnd || tags.includes('exotiq-sequence-suppressed') || tags.includes('do-not-contact')
}

export const EXOTIQ_SEQUENCE_TENANT_ID = EXOTIQ_TENANT_ID
