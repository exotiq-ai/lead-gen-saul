import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseQuery } from '@/lib/validation/parse'
import { leadsListQuerySchema } from '@/lib/validation/schemas'

const LEAD_SELECT_FIELDS = [
  'id',
  'first_name',
  'last_name',
  'company_name',
  'company_location',
  'company_industry',
  'company_size',
  'source',
  'score',
  'score_breakdown',
  'icp_fit_score',
  'engagement_score',
  'red_flags',
  'status',
  'assigned_to',
  'stage_id',
  'created_at',
  'last_activity_at',
].join(', ')

type SortOption = 'score_desc' | 'score_asc' | 'created_desc' | 'activity_desc'

const SORT_MAP: Record<SortOption, { column: string; ascending: boolean }> = {
  score_desc: { column: 'score', ascending: false },
  score_asc: { column: 'score', ascending: true },
  created_desc: { column: 'created_at', ascending: false },
  activity_desc: { column: 'last_activity_at', ascending: false },
}

export async function GET(req: NextRequest) {
  const parsed = parseQuery(leadsListQuerySchema, req.nextUrl)
  if (!parsed.success) return parsed.response
  const q = parsed.data
  const tenantId = q.tenant_id
  const page = q.page
  const limit = q.limit
  const offset = (page - 1) * limit

  const search = q.search
  const statusParam = q.status
  const sourceParam = q.source
  const assignedTo = q.assigned_to
  const redFlagsOnly = q.red_flags_only
  const stageId = q.stage_id
  const sortParam = q.sort
  const sort = SORT_MAP[sortParam]

  try {
    const supabase = createServerClient()

    let query = supabase
      .from('leads')
      .select(LEAD_SELECT_FIELDS, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
      .range(offset, offset + limit - 1)

    if (search) {
      query = query.or(
        `company_name.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`,
      )
    }

    if (statusParam) {
      const statuses = statusParam.split(',').map((s) => s.trim()).filter(Boolean)
      if (statuses.length === 1) {
        query = query.eq('status', statuses[0])
      } else if (statuses.length > 1) {
        query = query.in('status', statuses)
      }
    }

    if (sourceParam) {
      const sources = sourceParam.split(',').map((s) => s.trim()).filter(Boolean)
      if (sources.length === 1) {
        query = query.eq('source', sources[0])
      } else if (sources.length > 1) {
        query = query.in('source', sources)
      }
    }

    if (assignedTo && assignedTo !== 'all') {
      if (assignedTo === 'gregory') {
        query = query.eq('assigned_to', 'gregory')
      } else if (assignedTo === 'team') {
        query = query.eq('assigned_to', 'team')
      }
    }

    if (redFlagsOnly) {
      query = query.not('red_flags', 'eq', '[]').not('red_flags', 'is', null)
    }

    if (stageId) {
      query = query.eq('stage_id', stageId)
    }

    if (q.score_min != null) {
      query = query.gte('score', q.score_min)
    }

    if (q.score_max != null) {
      query = query.lte('score', q.score_max)
    }

    const { data, error, count } = await query

    if (error) throw error

    const total = count ?? 0

    return NextResponse.json({
      leads: data ?? [],
      total,
      page,
      limit,
      has_more: offset + limit < total,
    })
  } catch (err) {
    console.error('[leads]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
