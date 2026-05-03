import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { parseJsonBody } from '@/lib/validation/parse'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// PATCH /api/outreach/queue/bulk
//
// Body: { tenant_id, action: approve|reject, queue_ids: uuid[], reviewed_by? }
//
// Approves or rejects up to 200 queue items in one transaction.
// `mark_sent` is intentionally NOT supported here -- sending requires
// per-lead GHL routing and we don't want bulk to silently fall back to
// just-flip-status. Use the per-row Approve / Reject buttons for now;
// "Mark sent" stays per-row.
const bulkBody = z
  .object({
    tenant_id: z.string().regex(UUID_RE),
    action: z.enum(['approve', 'reject']),
    queue_ids: z.array(z.string().regex(UUID_RE)).min(1).max(200),
    reviewed_by: z.string().max(120).optional(),
  })

export async function PATCH(req: NextRequest) {
  const parsed = await parseJsonBody(req, bulkBody)
  if (!parsed.success) return parsed.response
  const { tenant_id, action, queue_ids, reviewed_by } = parsed.data
  const supabase = createServerClient()
  const now = new Date().toISOString()

  const patch: Record<string, unknown> = {
    updated_at: now,
    reviewed_by: reviewed_by ?? 'gregory',
  }
  if (action === 'approve') {
    patch.status = 'approved'
    patch.approved_at = now
  } else {
    patch.status = 'rejected'
  }

  // Only allow bulk transitions out of `pending` -- prevents accidental
  // un-rejecting or re-approving already-sent items.
  const { data, error } = await supabase
    .from('outreach_queue')
    .update(patch)
    .eq('tenant_id', tenant_id)
    .in('id', queue_ids)
    .eq('status', 'pending')
    .select('id, status')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    requested: queue_ids.length,
    affected: data?.length ?? 0,
    items: data ?? [],
  })
}
