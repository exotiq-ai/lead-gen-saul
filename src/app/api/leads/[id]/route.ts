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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const idResult = leadIdParamSchema.safeParse(id)
  if (!idResult.success) {
    return NextResponse.json({ error: 'Invalid lead id' }, { status: 400 })
  }

  let body: { status?: string; tenant_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { status, tenant_id } = body
  if (!status || !tenant_id) {
    return NextResponse.json({ error: 'status and tenant_id are required' }, { status: 400 })
  }
  if (!(VALID_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 })
  }

  try {
    const supabase = createServerClient()

    // Fetch current lead to get old status
    const { data: existing, error: fetchErr } = await supabase
      .from('leads')
      .select('status')
      .eq('id', idResult.data)
      .eq('tenant_id', tenant_id)
      .single()

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const oldStatus = existing.status

    // Update status
    const { data: updated, error: updateErr } = await supabase
      .from('leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', idResult.data)
      .eq('tenant_id', tenant_id)
      .select('*')
      .single()

    if (updateErr) throw updateErr

    // Log activity
    await supabase.from('lead_activities').insert({
      lead_id: idResult.data,
      tenant_id,
      activity_type: 'status_changed',
      channel: 'dashboard',
      metadata: { old_status: oldStatus, new_status: status },
      created_at: new Date().toISOString(),
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[lead-patch]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
