import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { cityFromLocation, isRoadTripEligibleLead, type RoadTripLeadInput } from '@/lib/road-trip/model'
import { DEMO_TENANT_ID } from '@/lib/validation/schemas'

const ROAD_TRIP_SELECT = [
  'id',
  'first_name',
  'last_name',
  'company_name',
  'company_location',
  'company_domain',
  'email',
  'phone',
  'score',
  'score_breakdown',
  'status',
  'assigned_to',
  'last_activity_at',
  'red_flags',
].join(', ')

export async function GET() {
  try {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('leads')
      .select(ROAD_TRIP_SELECT)
      .eq('tenant_id', DEMO_TENANT_ID)
      .order('score', { ascending: false, nullsFirst: false })
      .limit(1000)

    if (error) throw error

    const routeLeads = ((data ?? []) as unknown as RoadTripLeadInput[])
      .filter((lead) => isRoadTripEligibleLead(lead) && cityFromLocation(lead.company_location) !== null)

    return NextResponse.json({
      data: routeLeads,
      generated_at: new Date().toISOString(),
      location_note: 'Lead records currently contain market or address text; exact coordinate pins are not inferred.',
    })
  } catch (error) {
    console.error('[road-trip-leads]', error)
    return NextResponse.json({ error: 'Could not load road-trip leads' }, { status: 500 })
  }
}
