import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseQuery } from '@/lib/validation/parse'
import { activityQuerySchema } from '@/lib/validation/schemas'

const ACTIVITY_LABELS: Record<string, string> = {
  dm_sent: 'DM Sent',
  dm_opened: 'DM Opened',
  dm_replied: 'DM Replied',
  call_made: 'Call Made',
  call_answered: 'Call Answered',
  score_changed: 'Score Updated',
  enriched: 'Enriched',
  form_submitted: 'Form Submitted',
}

export async function GET(req: NextRequest) {
  const parsed = parseQuery(activityQuerySchema, req.nextUrl)
  if (!parsed.success) return parsed.response
  const { tenant_id: tenantId } = parsed.data

  try {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('lead_activities')
      .select('id, activity_type, metadata, created_at, lead_id, leads!inner(company_name, score)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error

    const activities = (data ?? []).map((row) => {
      const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads
      return {
        id: row.id,
        company_name: lead?.company_name ?? 'Unknown',
        score: lead?.score ?? null,
        activity_type: row.activity_type,
        human_label: ACTIVITY_LABELS[row.activity_type] ?? row.activity_type,
        created_at: row.created_at,
      }
    })

    return NextResponse.json({ activities })
  } catch (err) {
    console.error('[activity]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
