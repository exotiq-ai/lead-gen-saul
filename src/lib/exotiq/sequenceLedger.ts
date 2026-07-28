export type SequenceLedgerAttempt = {
  id: string
  lead_id: string
  sequence_step: number
  mode: string
  provider: string
  status: string
  subject: string | null
  provider_message_id: string | null
  error_detail: string | null
  attempted_at: string | null
  accepted_at: string | null
  delivered_at: string | null
  leads?: {
    first_name?: string | null
    last_name?: string | null
    email?: string | null
    company_name?: string | null
    ghl_contact_id?: string | null
  } | null
}

export type SequenceLedgerEvent = {
  id: string
  lead_id: string | null
  send_attempt_id: string | null
  provider: string
  event_type: string
  status: string
  quarantine_reason: string | null
  received_at: string
  processed_at: string | null
}

export function ghlContactUrl(locationId: string, contactId: string | null | undefined) {
  const location = locationId.trim()
  const contact = contactId?.trim() || ''
  if (!location || !contact) return null
  return `https://app.gohighlevel.com/v2/location/${encodeURIComponent(location)}/contacts/detail/${encodeURIComponent(contact)}`
}

export function buildSequenceDeliveryLedger(
  attempts: SequenceLedgerAttempt[],
  events: SequenceLedgerEvent[],
  locationId: string,
) {
  const eventsByAttempt = new Map<string, SequenceLedgerEvent[]>()
  for (const event of events) {
    if (!event.send_attempt_id) continue
    const rows = eventsByAttempt.get(event.send_attempt_id) || []
    rows.push(event)
    eventsByAttempt.set(event.send_attempt_id, rows)
  }

  return attempts.map((attempt) => {
    const contact = attempt.leads || null
    const name = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ').trim()
    const attemptEvents = (eventsByAttempt.get(attempt.id) || [])
      .sort((a, b) => b.received_at.localeCompare(a.received_at))
    return {
      ...attempt,
      contact_name: name || null,
      company_name: contact?.company_name || null,
      recipient: contact?.email || null,
      ghl_contact_id: contact?.ghl_contact_id || null,
      ghl_contact_url: ghlContactUrl(locationId, contact?.ghl_contact_id),
      events: attemptEvents,
      latest_event: attemptEvents[0] || null,
    }
  })
}
