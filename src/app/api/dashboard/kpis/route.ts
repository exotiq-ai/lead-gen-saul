import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseQuery } from '@/lib/validation/parse'
import { requiredTenantIdQuerySchema } from '@/lib/validation/schemas'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  console.log('--- KPI Route Debug ---')
  console.log('Request URL:', req.url)
  console.log('Supabase URL available:', !!process.env.NEXT_PUBLIC_SUPABASE_URL)
  console.log('Supabase Key available:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)
  
  const parsed = parseQuery(requiredTenantIdQuerySchema, req.nextUrl)
  if (!parsed.success) {
    console.error('Zod parsing failed:', parsed.response.body)
    return parsed.response
  }
  const { tenant_id: tenantId } = parsed.data
  console.log('Tenant ID from query:', tenantId)

  try {
    const supabase = createServerClient()
    console.log('Supabase client created.')
    
    // Test query
    const { data, error, count } = await supabase.from('leads').select('id', { count: 'exact' }).eq('tenant_id', tenantId)
    
    if (error) {
        console.error('Supabase query error:', error)
        return NextResponse.json({ error: 'Supabase query failed', details: error.message }, { status: 500 })
    }
    console.log('Supabase query successful. Lead count:', count)
    
    return NextResponse.json({ success: true, leadCount: count, tenantId })

  } catch (err: any) {
    console.error('Caught an exception:', err)
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 })
  }
}
