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
    const totalPages = Math.max(1, Math.ceil(total / limit))

    // Aggregates for the leads page stats row. These are scoped to the
    // current tenant but ignore the active filters on purpose -- the stats
    // row is a global tenant snapshot, not a filtered view.
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)
    const monthStartIso = monthStart.toISOString()

    const [
      { count: redFlagCount },
      { count: gregoryCount },
      { count: convertedThisMonth },
    ] = await Promise.all([
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .not('red_flags', 'eq', '[]')
        .not('red_flags', 'is', null),
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('assigned_to', 'gregory'),
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'converted')
        .gte('updated_at', monthStartIso),
    ])

    return NextResponse.json({
      data: data ?? [],
      meta: {
        total,
        page,
        limit,
        totalPages,
        offset,
        has_more: offset + limit < total,
        red_flag_count: redFlagCount ?? 0,
        gregory_count: gregoryCount ?? 0,
        converted_this_month: convertedThisMonth ?? 0,
      },
      // Legacy fields kept for transitional compatibility; new clients
      // should read `data` and `meta` instead.
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ImportLead {
  company_name: string
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  city?: string
  state?: string
  source?: string
}

export async function POST(req: NextRequest) {
  let body: { tenant_id?: string; leads?: ImportLead[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { tenant_id, leads } = body
  if (!tenant_id || !UUID_RE.test(tenant_id)) {
    return NextResponse.json({ error: 'Valid tenant_id (UUID) is required' }, { status: 400 })
  }
  if (!Array.isArray(leads) || leads.length === 0) {
    return NextResponse.json({ error: 'leads array is required and cannot be empty' }, { status: 400 })
  }
  if (leads.length > 500) {
    return NextResponse.json({ error: 'Maximum 500 leads per import' }, { status: 400 })
  }

  const rows = leads
    .filter((l) => l.company_name?.trim())
    .map((l) => ({
      tenant_id,
      company_name: l.company_name.trim(),
      first_name: l.first_name?.trim() || null,
      last_name: l.last_name?.trim() || null,
      email: l.email?.trim() || null,
      phone: l.phone?.trim() || null,
      city: l.city?.trim() || null,
      state: l.state?.trim() || null,
      source: l.source?.trim() || 'api',
      status: 'new' as const,
      assigned_to: null,
      score: null,
      red_flags: [],
      tags: [],
      metadata: {},
    }))

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid leads (company_name required)' }, { status: 400 })
  }

  try {
    const supabase = createServerClient()
    const { error } = await supabase.from('leads').insert(rows)
    if (error) throw error
    return NextResponse.json({ imported: rows.length })
  } catch (err) {
    console.error('[leads-import]', err)
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}
