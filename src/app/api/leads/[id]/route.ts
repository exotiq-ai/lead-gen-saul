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
