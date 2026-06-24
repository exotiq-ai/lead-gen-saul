import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseQuery } from '@/lib/validation/parse'
import { leadDetailQuerySchema, leadIdParamSchema } from '@/lib/validation/schemas'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const idResult = leadIdParamSchema.safeParse(id)
  if (!idResult.success) {
    return NextResponse.json({ error: 'Invalid lead id' }, { status: 400 })
  }

  const parsed = parseQuery(leadDetailQuerySchema, req.nextUrl)
  if (!parsed.success) return parsed.response
  const tenantId = parsed.data.tenant_id

  try {
    const supabase = createServerClient()

    const [leadResult, activitiesResult, enrichmentsResult] = await Promise.all([
      supabase
        .from('leads')
        .select(
          `
          *,
          pipeline_stages!stage_id (
            id,
            name,
            slug,
            color,
            position,
            is_terminal,
            terminal_type
          )
        `,
        )
        .eq('id', idResult.data)
        .eq('tenant_id', tenantId)
        .single(),

      supabase
        .from('lead_activities')
        .select('id, lead_id, tenant_id, activity_type, channel, metadata, created_at')
        .eq('lead_id', idResult.data)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(20),

      supabase
        .from('enrichments')
        .select('*')
        .eq('lead_id', idResult.data)
        .eq('tenant_id', tenantId)
        .order('requested_at', { ascending: false }),
    ])

    if (leadResult.error) {
      if (leadResult.error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
      }
      throw leadResult.error
    }

    if (activitiesResult.error) throw activitiesResult.error
    if (enrichmentsResult.error) throw enrichmentsResult.error

    const lead = leadResult.data as Record<string, unknown>
    const stage = lead.pipeline_stages ?? null
    delete lead.pipeline_stages

    return NextResponse.json({
      ...lead,
      stage,
      activities: activitiesResult.data ?? [],
      enrichments: enrichmentsResult.data ?? [],
    })
  } catch (err) {
    console.error('[lead-detail]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const VALID_STATUSES = [
  'new', 'enriching', 'scored', 'outreach', 'engaged',
  'qualified', 'converted', 'lost', 'disqualified',
] as const

const VALID_ASSIGNEES = ['gregory', 'benjamin', 'team'] as const
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const idResult = leadIdParamSchema.safeParse(id)
  if (!idResult.success) {
    return NextResponse.json({ error: 'Invalid lead id' }, { status: 400 })
  }

  let body: { status?: string; assigned_to?: string | null; stage_id?: string | null; tenant_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { status, assigned_to, stage_id, tenant_id } = body
  if (!tenant_id) {
    return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })
  }
  if (!status && assigned_to === undefined && stage_id === undefined) {
    return NextResponse.json({ error: 'status, assigned_to, or stage_id is required' }, { status: 400 })
  }
  if (status && !(VALID_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 })
  }
  if (
    assigned_to !== undefined &&
    assigned_to !== null &&
    !(VALID_ASSIGNEES as readonly string[]).includes(assigned_to)
  ) {
    return NextResponse.json({ error: `Invalid assigned_to: ${assigned_to}` }, { status: 400 })
  }
  if (stage_id !== undefined && stage_id !== null && !UUID_RE.test(stage_id)) {
    return NextResponse.json({ error: 'Invalid stage_id' }, { status: 400 })
  }

  try {
    const supabase = createServerClient()

    // Fetch current lead to log deltas accurately.
    const { data: existing, error: fetchErr } = await supabase
      .from('leads')
      .select('status, assigned_to, stage_id')
      .eq('id', idResult.data)
      .eq('tenant_id', tenant_id)
      .single()

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const update: Record<string, string | null> = { updated_at: new Date().toISOString() }
    if (status) update.status = status
    if (assigned_to !== undefined) update.assigned_to = assigned_to
    if (stage_id !== undefined) update.stage_id = stage_id

    const { data: updated, error: updateErr } = await supabase
      .from('leads')
      .update(update)
      .eq('id', idResult.data)
      .eq('tenant_id', tenant_id)
      .select('*')
      .single()

    if (updateErr) throw updateErr

    const now = new Date().toISOString()
    const activities = []
    if (status && status !== existing.status) {
      activities.push({
        lead_id: idResult.data,
        tenant_id,
        activity_type: 'status_changed',
        channel: 'dashboard',
        metadata: { old_status: existing.status, new_status: status },
        created_at: now,
      })
    }
    if (assigned_to !== undefined && assigned_to !== existing.assigned_to) {
      activities.push({
        lead_id: idResult.data,
        tenant_id,
        activity_type: assigned_to ? 'lead_claimed' : 'lead_unclaimed',
        channel: 'dashboard',
        metadata: { old_assigned_to: existing.assigned_to, new_assigned_to: assigned_to },
        created_at: now,
      })
    }
    if (stage_id !== undefined && stage_id !== existing.stage_id) {
      activities.push({
        lead_id: idResult.data,
        tenant_id,
        activity_type: 'pipeline_stage_changed',
        channel: 'dashboard',
        metadata: { old_stage_id: existing.stage_id, new_stage_id: stage_id },
        created_at: now,
      })
    }
    if (activities.length) await supabase.from('lead_activities').insert(activities)

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[lead-patch]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
