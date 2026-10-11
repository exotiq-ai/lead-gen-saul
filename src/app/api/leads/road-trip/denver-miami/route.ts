import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEMO_TENANT_ID } from '@/lib/validation/schemas'
import { TRIP_ID, tripLead } from '@/lib/road-trip/denverMiami'
import type { RoadTripLeadInput } from '@/lib/road-trip/model'

export const dynamic = 'force-dynamic'

// Protected by the same /api/leads proxy boundary as the existing road-trip API.
// Fixed to Exotiq; tenant/query input can never select another tenant's records.
export async function GET() {
  try {
    const db = createServerClient()
    const { data, error } = await db.from('leads')
      .select('id,company_name,status,red_flags,score_breakdown')
      .eq('tenant_id', DEMO_TENANT_ID)
      .eq('score_breakdown->road_trip_2026->>trip_id', TRIP_ID)
      .order('id')
      .limit(500)
    if (error) throw error
    const rows = (data ?? []) as unknown as RoadTripLeadInput[]
    const leads = rows.map(row => tripLead(row)).filter((lead) => lead !== null)
    return NextResponse.json({
      data: leads,
      excluded_count: rows.length - leads.length,
      generated_at: new Date().toISOString(),
      note: 'Online business-location matching is not confirmation of walk-in access. Call before visiting. No appointments are implied.',
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'Could not load trip research. Please retry.' }, { status: 500 })
  }
}
