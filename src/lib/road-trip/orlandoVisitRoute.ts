export const ORLANDO_ROUTE_ORIGIN = '4725 Vineland Rd, Orlando, FL 32811'

export interface OrlandoVisitStop {
  order: number
  leadId: string
  companyName: string
  address: string
  phone: string
  verification: 'Google Business Profile' | 'Official website'
  visitNote: string
  mapsPlaceUrl?: string
}

export const ORLANDO_VISIT_STOPS: OrlandoVisitStop[] = [
  {
    order: 1,
    leadId: '81795a35-9fce-4061-96bb-b8019925a0ce',
    companyName: 'American Luxury Group',
    address: '4387 36th St Ste A, Orlando, FL 32811',
    phone: '(407) 250-6080',
    verification: 'Google Business Profile',
    visitNote: 'Strongest nearby walk-in candidate, verified rental category, website and phone.',
    mapsPlaceUrl: 'https://maps.google.com/?cid=1513162917822179780',
  },
  {
    order: 2,
    leadId: 'a72a183b-13da-4300-97ec-939f4237c49d',
    companyName: 'VDC Exotic Rentals',
    address: '25 Wall St #10, Orlando, FL 32801',
    phone: '(407) 529-9223',
    verification: 'Official website',
    visitNote: 'Downtown address is published on the operator website. Call first because no exact Google Business Profile matched.',
  },
  {
    order: 3,
    leadId: '2c0f87bd-0f5d-467d-8b82-7c1d2b8a4435',
    companyName: 'Orlando Exotic Car Rentals',
    address: '5250 International Dr, Orlando, FL 32819',
    phone: '(888) 674-4044',
    verification: 'Google Business Profile',
    visitNote: 'Verified car-rental listing with a physical address. Google lists a different phone than the imported lead, so use this Maps-verified number.',
    mapsPlaceUrl: 'https://maps.google.com/?cid=16106698212892205882',
  },
  {
    order: 4,
    leadId: '249b0d08-232f-49e2-af44-da05a3d73e07',
    companyName: 'Premier Auto Orlando',
    address: '8788 Vineland Ave B, Orlando, FL 32821',
    phone: '(407) 554-9624',
    verification: 'Official website',
    visitNote: 'The Orlando site publishes this address and local number. Call first because the imported lead phone was invalid and no exact Google rental profile matched.',
  },
  {
    order: 5,
    leadId: '9c3f1916-a5fc-406c-a439-b8acbc9df6c9',
    companyName: 'Binson Rentals',
    address: '10195 Ancora Cir, Orlando, FL 32821',
    phone: '(407) 845-9141',
    verification: 'Google Business Profile',
    visitNote: 'Exact name, website and phone match on Google. Call first because the address may be appointment-based.',
    mapsPlaceUrl: 'https://maps.google.com/?cid=8139514017137204555',
  },
  {
    order: 6,
    leadId: 'f603135c-97e0-4b8e-8007-ca93834bf072',
    companyName: 'Royal International Cars',
    address: '3255 McCoy Rd, Belle Isle, FL 32812',
    phone: '(407) 342-4490',
    verification: 'Google Business Profile',
    visitNote: 'Exact operator, phone and website match. This eastern stop is the most efficient finish after the south-Orlando stops.',
    mapsPlaceUrl: 'https://maps.google.com/?cid=10951097744787751443',
  },
]

export const ORLANDO_ROUTE_REVIEW_NOTES = [
  'Corsa Automotive was removed from the rental route. Its current site is an auto repair, collision, tuning and wraps business, not an exotic rental operator.',
  'Champions Exotics and Level Up Luxuri appear to be real rental operators, but no visitable Orlando address could be verified. Contact them by phone instead.',
  'Prestige Luxury Rentals is based in Miami. PG Luxury Services and Energetic Exotics are based in Tampa. Their Orlando pages are service-area pages, not local storefronts.',
  'Luxury Car Rental USA and Corza Luxury did not produce a confirmed Orlando storefront. Keep them in phone research, not today’s drive route.',
]

export function googleMapsDirectionsUrl(origin: string, destination: string, waypoints: string[] = []): string {
  const params = new URLSearchParams({ api: '1', origin, destination, travelmode: 'driving' })
  if (waypoints.length) params.set('waypoints', waypoints.join('|'))
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export function routeLegUrl(index: number): string {
  const stop = ORLANDO_VISIT_STOPS[index]
  const origin = index === 0 ? ORLANDO_ROUTE_ORIGIN : ORLANDO_VISIT_STOPS[index - 1].address
  return googleMapsDirectionsUrl(origin, stop.address)
}

export const ORLANDO_ROUTE_A_URL = googleMapsDirectionsUrl(
  ORLANDO_ROUTE_ORIGIN,
  ORLANDO_VISIT_STOPS[2].address,
  ORLANDO_VISIT_STOPS.slice(0, 2).map((stop) => stop.address),
)

export const ORLANDO_ROUTE_B_URL = googleMapsDirectionsUrl(
  ORLANDO_VISIT_STOPS[2].address,
  ORLANDO_VISIT_STOPS[5].address,
  ORLANDO_VISIT_STOPS.slice(3, 5).map((stop) => stop.address),
)
