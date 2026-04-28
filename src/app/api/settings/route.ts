import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenant_id')
  if (!tenantId || !UUID_RE.test(tenantId)) {
    return NextResponse.json({ error: 'Valid tenant_id required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const [tenantResult, icpResult, statsResult] = await Promise.all([
    supabase
      .from('tenants')
      .select('id, name, slug, created_at')
      .eq('id', tenantId)
      .single(),
    supabase
      .from('icp_profiles')
      .select('id, name, criteria, is_active, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
  ])

  return NextResponse.json({
    tenant: tenantResult.data ?? null,
    icp_profile: icpResult.data ?? null,
    lead_count: statsResult.count ?? 0,
  })
}

export async function PATCH(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenant_id')
  if (!tenantId || !UUID_RE.test(tenantId)) {
    return NextResponse.json({ error: 'Valid tenant_id required' }, { status: 400 })
  }

  let body: { criteria?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.criteria || typeof body.criteria !== 'object') {
    return NextResponse.json({ error: 'criteria object required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: existing } = await supabase
    .from('icp_profiles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('icp_profiles')
      .update({ criteria: body.criteria, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase
      .from('icp_profiles')
      .insert({
        tenant_id: tenantId,
        name: 'Default ICP',
        criteria: body.criteria,
        is_active: true,
      })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
