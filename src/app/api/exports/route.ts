import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { parseQuery } from '@/lib/validation/parse'
import { streamCsv, paginate } from '@/lib/utils/csv'

export const runtime = 'nodejs'
// Streaming responses don't make sense in the static cache.
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const querySchema = z.object({
  tenant_id: z.string().regex(UUID_RE),
  dataset: z.enum(['leads', 'outreach', 'enrichments', 'activities']),
})

// GET /api/exports?tenant_id=...&dataset=leads
//
// Streams a CSV of the requested dataset for the tenant. We page through
// supabase 500 rows at a time so the export works for tenants with many
// thousands of rows without holding everything in memory.
export async function GET(req: NextRequest) {
  const parsed = parseQuery(querySchema, req.nextUrl)
  if (!parsed.success) return parsed.response
  const { tenant_id: tenantId, dataset } = parsed.data

  const supabase = createServerClient()
  const today = new Date().toISOString().slice(0, 10)

  switch (dataset) {
    case 'leads': {
      const rows = paginate<Record<string, unknown>>(async (offset, limit) => {
        const { data, error } = await supabase
          .from('leads')
          .select(
            'id, first_name, last_name, email, phone, company_name, company_industry, company_location, source, status, assigned_to, score, icp_fit_score, engagement_score, red_flags, created_at, updated_at, last_activity_at',
          )
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: true })
          .range(offset, offset + limit - 1)
        if (error) throw error
        return (data ?? []) as Record<string, unknown>[]
      }, 500)
      return streamCsv({
        filename: `leads-${tenantId.slice(0, 8)}-${today}.csv`,
        headers: [
          'id', 'first_name', 'last_name', 'email', 'phone', 'company_name',
          'company_industry', 'company_location', 'source', 'status',
          'assigned_to', 'score', 'icp_fit_score', 'engagement_score',
          'red_flags', 'created_at', 'updated_at', 'last_activity_at',
        ],
        rows,
        rowToValues: (r) => [
          r.id, r.first_name, r.last_name, r.email, r.phone, r.company_name,
          r.company_industry, r.company_location, r.source, r.status,
          r.assigned_to, r.score, r.icp_fit_score, r.engagement_score,
          r.red_flags, r.created_at, r.updated_at, r.last_activity_at,
        ],
      })
    }

    case 'outreach': {
      const rows = paginate<Record<string, unknown>>(async (offset, limit) => {
        const { data, error } = await supabase
          .from('outreach_queue')
          .select(
            'id, lead_id, channel, status, message_draft, generated_by, reviewed_by, approved_at, sent_at, rejection_reason, created_at, updated_at, leads ( company_name, score, first_name, last_name )',
          )
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: true })
          .range(offset, offset + limit - 1)
        if (error) throw error
        return (data ?? []) as Record<string, unknown>[]
      }, 300)
      return streamCsv({
        filename: `outreach-${tenantId.slice(0, 8)}-${today}.csv`,
        headers: [
          'id', 'lead_id', 'company_name', 'first_name', 'last_name', 'lead_score',
          'channel', 'status', 'message_draft', 'generated_by', 'reviewed_by',
          'approved_at', 'sent_at', 'rejection_reason', 'created_at', 'updated_at',
        ],
        rows,
        rowToValues: (r) => {
          const lead = (r.leads ?? {}) as Record<string, unknown>
          return [
            r.id, r.lead_id, lead.company_name, lead.first_name, lead.last_name,
            lead.score, r.channel, r.status, r.message_draft, r.generated_by,
            r.reviewed_by, r.approved_at, r.sent_at, r.rejection_reason,
            r.created_at, r.updated_at,
          ]
        },
      })
    }

    case 'enrichments': {
      const rows = paginate<Record<string, unknown>>(async (offset, limit) => {
        const { data, error } = await supabase
          .from('enrichments')
          .select(
            'id, lead_id, provider, status, cost_cents, tokens_used, requested_at, completed_at, error_message, leads ( company_name )',
          )
          .eq('tenant_id', tenantId)
          .order('requested_at', { ascending: true })
          .range(offset, offset + limit - 1)
        if (error) throw error
        return (data ?? []) as Record<string, unknown>[]
      }, 500)
      return streamCsv({
        filename: `enrichments-${tenantId.slice(0, 8)}-${today}.csv`,
        headers: [
          'id', 'lead_id', 'company_name', 'provider', 'status',
          'cost_cents', 'tokens_used', 'requested_at', 'completed_at',
          'error_message',
        ],
        rows,
        rowToValues: (r) => {
          const lead = (r.leads ?? {}) as Record<string, unknown>
          return [
            r.id, r.lead_id, lead.company_name, r.provider, r.status,
            r.cost_cents, r.tokens_used, r.requested_at, r.completed_at,
            r.error_message,
          ]
        },
      })
    }

    case 'activities': {
      const rows = paginate<Record<string, unknown>>(async (offset, limit) => {
        const { data, error } = await supabase
          .from('lead_activities')
          .select('id, lead_id, activity_type, channel, metadata, created_at, leads ( company_name )')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: true })
          .range(offset, offset + limit - 1)
        if (error) throw error
        return (data ?? []) as Record<string, unknown>[]
      }, 500)
      return streamCsv({
        filename: `activities-${tenantId.slice(0, 8)}-${today}.csv`,
        headers: ['id', 'lead_id', 'company_name', 'activity_type', 'channel', 'metadata', 'created_at'],
        rows,
        rowToValues: (r) => {
          const lead = (r.leads ?? {}) as Record<string, unknown>
          return [r.id, r.lead_id, lead.company_name, r.activity_type, r.channel, r.metadata, r.created_at]
        },
      })
    }

    default:
      return NextResponse.json({ error: 'unknown dataset' }, { status: 400 })
  }
}
