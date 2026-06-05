import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { leadIdParamSchema } from '@/lib/validation/schemas'
import { normalizeCallNote } from '@/lib/leads/callNotes'

const GHL_BASE = 'https://services.leadconnectorhq.com'

type LeadNoteBody = {
  tenant_id?: string
  note?: string
  sync_to_ghl?: boolean
}

async function createGhlContactNote(contactId: string, note: string) {
  const apiKey = process.env.GHL_API_KEY
  if (!apiKey) return { synced: false, reason: 'missing_GHL_API_KEY' }

  const response = await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: '2021-07-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body: note }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    return { synced: false, reason: `ghl_note_failed_${response.status}`, detail: text.slice(0, 300) }
  }

  const data = await response.json().catch(() => ({}))
  return { synced: true, note_id: data?.note?.id ?? data?.id ?? null }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const idResult = leadIdParamSchema.safeParse(id)
  if (!idResult.success) {
    return NextResponse.json({ error: 'Invalid lead id' }, { status: 400 })
  }

  let body: LeadNoteBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.tenant_id) {
    return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })
  }

  let note: string
  try {
    note = normalizeCallNote(body.note ?? '')
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid note' }, { status: 400 })
  }

  try {
    const supabase = createServerClient()
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, tenant_id, company_name, ghl_contact_id')
      .eq('id', idResult.data)
      .eq('tenant_id', body.tenant_id)
      .single()

    if (leadErr || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const shouldSyncToGhl = body.sync_to_ghl !== false
    const ghlResult = shouldSyncToGhl && lead.ghl_contact_id
      ? await createGhlContactNote(lead.ghl_contact_id, note)
      : { synced: false, reason: lead.ghl_contact_id ? 'sync_disabled' : 'missing_ghl_contact_id' }

    const now = new Date().toISOString()
    const { data: activity, error: activityErr } = await supabase
      .from('lead_activities')
      .insert({
        lead_id: idResult.data,
        tenant_id: body.tenant_id,
        activity_type: 'call_note',
        channel: 'dashboard',
        metadata: {
          note,
          ghl_contact_id: lead.ghl_contact_id,
          ghl_note_sync: ghlResult,
        },
        created_at: now,
      })
      .select('id, lead_id, tenant_id, activity_type, channel, metadata, created_at')
      .single()

    if (activityErr) throw activityErr

    await supabase
      .from('leads')
      .update({ last_activity_at: now, updated_at: now })
      .eq('id', idResult.data)
      .eq('tenant_id', body.tenant_id)

    return NextResponse.json({ activity, ghl_note_sync: ghlResult })
  } catch (err) {
    console.error('[lead-call-note]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
