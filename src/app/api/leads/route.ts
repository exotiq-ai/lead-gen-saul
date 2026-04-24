import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEMO_TENANT_ID = '00000000-0000-0000-0000-000000000001'

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
  const params = req.nextUrl.searchParams
  const tenantId = params.get('tenant_id') ?? DEMO_TENANT_ID

  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10))
  const limit = Math.min(200, Math.max(1, parseInt(params.get('limit') ?? '50', 10)))
  const offset = (page - 1) * limit

  const search = params.get('search')?.trim()
  const statusParam = params.get('status')
  const sourceParam = params.get('source')
  const assignedTo = params.get('assigned_to')
  const redFlagsOnly = params.get('red_flags_only') === 'true'
  const stageId = params.get('stage_id')
  const scoreMin = params.get('score_min')
  const scoreMax = params.get('score_max')
  const sortParam = (params.get('sort') ?? 'score_desc') as SortOption

  if (!SORT_MAP[sortParam]) {
    return NextResponse.json(
      { error: 'Invalid sort. Must be one of: score_desc, score_asc, created_desc, activity_desc' },
      { status: 400 }
    )
  }

  try {
    const supabase = createServerClient()
    const sort = SORT_MAP[sortParam]

    let query = supabase
      .from('leads')
      .select(LEAD_SELECT_FIELDS, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
      .range(offset, offset + limit - 1)

    if (search) {
      query = query.or(
        `company_name.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`
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

    if (scoreMin) {
      const min = parseInt(scoreMin, 10)
      if (!isNaN(min)) query = query.gte('score', min)
    }

    if (scoreMax) {
      const max = parseInt(scoreMax, 10)
      if (!isNaN(max)) query = query.lte('score', max)
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
