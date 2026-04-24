import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseJsonBody } from '@/lib/validation/parse'
import { outreachQueuePatchBodySchema } from '@/lib/validation/schemas'

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
    case 'mark_sent':
      patch = { ...patch, status: 'sent', sent_at: now }
      break
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

  return NextResponse.json({ item: data })
}
