import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseQuery } from '@/lib/validation/parse'
import { defaultTenantQuerySchema } from '@/lib/validation/schemas'

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

const TERMINAL_STATUSES = ['converted', 'lost', 'disqualified']

export async function GET(req: NextRequest) {
  const parsed = parseQuery(defaultTenantQuerySchema, req.nextUrl)
  if (!parsed.success) return parsed.response
  const { tenant_id: tenantId } = parsed.data

  try {
    const supabase = createServerClient()
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayISO = todayStart.toISOString()

    // Parallel queries
    const [
      activitiesRes,
      dmRepliedRes,
      pendingApprovalRes,
      redFlagsRes,
      outreachSentRes,
      newLeadsRes,
      scoredRes,
      repliesRes,
      scoreJumpsRes,
      staleRes,
    ] = await Promise.all([
      // Recent activity (same as /api/dashboard/activity)
      supabase
        .from('lead_activities')
        .select('id, activity_type, metadata, created_at, lead_id, leads!inner(company_name, score)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(20),

      // DM replied today
      supabase
        .from('lead_activities')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('activity_type', 'dm_replied')
        .gte('created_at', todayISO),

      // Pending approval in outreach_queue
      supabase
        .from('outreach_queue')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'pending'),

      // Red flags today (leads with red_flags that aren't terminal)
      supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`)
        .not('red_flags', 'is', null)
        .not('red_flags', 'eq', '[]'),

      // Outreach sent today
      supabase
        .from('lead_activities')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('activity_type', 'dm_sent')
        .gte('created_at', todayISO),

      // New leads today
      supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', todayISO),

      // Leads scored today
      supabase
        .from('lead_activities')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('activity_type', 'score_changed')
        .gte('created_at', todayISO),

      // Replies received today
      supabase
        .from('lead_activities')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('activity_type', ['dm_replied', 'call_answered'])
        .gte('created_at', todayISO),

      // Score jumps — leads whose score increased significantly recently
      supabase
        .from('leads')
        .select('id, company_name, score, previous_score')
        .eq('tenant_id', tenantId)
        .not('previous_score', 'is', null)
        .not('score', 'is', null)
        .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`)
        .order('updated_at', { ascending: false })
        .limit(50),

      // Stale leads — last_activity_at > 14 days, previously engaged
      supabase
        .from('leads')
        .select('id, company_name, last_activity_at, status')
        .eq('tenant_id', tenantId)
        .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`)
        .in('status', ['contacted', 'engaged', 'qualified'])
        .lt('last_activity_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
        .order('last_activity_at', { ascending: true })
        .limit(5),
    ])

    // Build priority actions
    const priorityActions = [
      { type: 'dm_replied', count: dmRepliedRes.count ?? 0, label: 'Leads replied to DMs' },
      { type: 'pending_approval', count: pendingApprovalRes.count ?? 0, label: 'Outreach awaiting approval' },
      { type: 'red_flags_today', count: redFlagsRes.count ?? 0, label: 'New red flags today' },
    ]

    // Build today stats
    const todayStats = {
      outreach_sent: outreachSentRes.count ?? 0,
      new_leads: newLeadsRes.count ?? 0,
      leads_scored: scoredRes.count ?? 0,
      replies_received: repliesRes.count ?? 0,
    }

    // Build outliers
    const outliers: Array<{ lead_id: string; company_name: string; reason: string; type: string }> = []

    // Score jumps
    if (scoreJumpsRes.data) {
      for (const lead of scoreJumpsRes.data) {
        const diff = (lead.score ?? 0) - (lead.previous_score ?? 0)
        if (diff >= 15) {
          outliers.push({
            lead_id: lead.id,
            company_name: lead.company_name ?? 'Unknown',
            reason: `Score jumped +${diff} today`,
            type: 'score_jump',
          })
        }
        if (outliers.filter((o) => o.type === 'score_jump').length >= 3) break
      }
    }

    // Stale leads
    if (staleRes.data) {
      for (const lead of staleRes.data) {
        outliers.push({
          lead_id: lead.id,
          company_name: lead.company_name ?? 'Unknown',
          reason: 'Stale 14+ days, was engaged',
          type: 'gone_stale',
        })
      }
    }

    // Recent activity (same format as /api/dashboard/activity)
    const recentActivity = (activitiesRes.data ?? []).map((row) => {
      const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads
      return {
        id: row.id,
        company_name: (lead as { company_name?: string })?.company_name ?? 'Unknown',
        score: (lead as { score?: number | null })?.score ?? null,
        activity_type: row.activity_type,
        human_label: ACTIVITY_LABELS[row.activity_type] ?? row.activity_type,
        created_at: row.created_at,
      }
    })

    return NextResponse.json({
      priority_actions: priorityActions,
      today_stats: todayStats,
      outliers,
      recent_activity: recentActivity,
    })
  } catch (err) {
    console.error('[brief]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
