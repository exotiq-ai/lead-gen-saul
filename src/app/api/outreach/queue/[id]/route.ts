import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseJsonBody } from '@/lib/validation/parse'
import { outreachQueuePatchBodySchema } from '@/lib/validation/schemas'
import { sendMessage } from '@/lib/ghl/outbound'

export const runtime = 'nodejs'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const parsed = await parseJsonBody(req, outreachQueuePatchBodySchema)
  if (!parsed.success) return parsed.response

  const { tenant_id: tenantId, action, message_draft, reviewed_by } = parsed.data
  const supabase = createServerClient()
  const now = new Date().toISOString()

  const base = { updated_at: now, reviewed_by: reviewed_by ?? 'gregory' }

  let patch: Record<string, unknown> = { ...base }
  let sendResult: Awaited<ReturnType<typeof sendMessage>> | null = null

  switch (action) {
    case 'approve':
      patch = { ...patch, status: 'approved', approved_at: now }
      break
    case 'reject':
      patch = { ...patch, status: 'rejected' }
      break
    case 'edit':
      patch = { ...patch, message_draft, status: 'pending' }
      break
    case 'mark_sent': {
      // Look up the queue item + lead so we can route the actual GHL send.
      const { data: queueItem, error: lookupErr } = await supabase
        .from('outreach_queue')
        .select(
          'id, channel, message_draft, lead_id, leads ( ghl_contact_id, email, phone, first_name, last_name, company_name )',
        )
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle()

      if (lookupErr) {
        return NextResponse.json({ error: lookupErr.message }, { status: 500 })
      }
      if (!queueItem) {
        return NextResponse.json({ error: 'Queue item not found' }, { status: 404 })
      }

      type LeadJoined = {
        ghl_contact_id: string | null
        email: string | null
        phone: string | null
        first_name: string | null
        last_name: string | null
        company_name: string | null
      }
      const leadJoin = queueItem.leads as unknown as LeadJoined | LeadJoined[] | null
      const lead = (Array.isArray(leadJoin) ? leadJoin[0] : leadJoin) ?? null

      sendResult = await sendMessage({
        tenantId,
        ghlContactId: lead?.ghl_contact_id ?? null,
        channel: queueItem.channel as string,
        body: (queueItem.message_draft as string) ?? '',
        email: lead?.email ?? null,
        phone: lead?.phone ?? null,
        firstName: lead?.first_name ?? null,
        lastName: lead?.last_name ?? null,
        companyName: lead?.company_name ?? null,
      })

      if (!sendResult.ok) {
        // Don't flip status; surface the error so the user can retry
        // (or fix env / dry-run flag).
        return NextResponse.json(
          {
            error: `GHL send failed: ${sendResult.error}`,
            ghl_status: sendResult.status,
          },
          { status: 502 },
        )
      }

      patch = {
        ...patch,
        status: 'sent',
        sent_at: now,
        // Stash the GHL message id + mode in rejection_reason for now.
        // (Schema doesn't have a dedicated column; the outreach_queue
        // table's free-text fields are limited. A future migration can
        // add ghl_message_id / send_mode if needed.)
        rejection_reason:
          sendResult.mode === 'dry_run'
            ? `dry_run:${sendResult.messageId}${sendResult.reason ? `:${sendResult.reason}` : ''}`
            : `live:${sendResult.messageId}`,
      }
      break
    }
    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('outreach_queue')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Queue item not found' }, { status: 404 })
  }

  // For mark_sent, also create a lead_activities entry so the activity feed
  // and re-scoring loop see it. Channel-aware activity_type.
  if (action === 'mark_sent' && sendResult?.ok) {
    const channel = (data as Record<string, unknown>).channel as string
    const activityType = channel === 'email' ? 'email_sent' : 'dm_sent'
    await supabase.from('lead_activities').insert({
      tenant_id: tenantId,
      lead_id: (data as Record<string, unknown>).lead_id as string,
      activity_type: activityType,
      channel: channel === 'email' ? 'email' : channel === 'sms' ? 'sms' : 'ghl',
      metadata: {
        ghl_message_id: sendResult.messageId,
        outreach_queue_id: id,
        send_mode: sendResult.mode,
      },
    })
  }

  return NextResponse.json({ item: data, send: sendResult })
}
