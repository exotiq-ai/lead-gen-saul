# Source-backed Denver → Miami field sales

## Routes
- Current field companion: `/dashboard/road-trip/denver-miami`
- Existing Texas → Florida trip remains `/dashboard/road-trip`.
- Existing Orlando itinerary remains `/dashboard/road-trip/orlando`.
- Sidebar opens the current trip. Canonical lead detail links back to its research card.

## Data and authorization
The page reads only persisted Exotiq records through the authenticated, GET-only
`/api/leads/road-trip/denver-miami` endpoint. The tenant is fixed server-side.
Responses are private/no-store; no business dossiers are bundled in frontend source.

Evidence lives in `leads.score_breakdown.road_trip_2026`, keyed internally by
`trip_id=denver-miami-2026`. Each record includes sources, capture dates, explicit
owner/contact gaps, fleet evidence, address disposition, review sample basis, and
Instagram publication coverage. Existing pipeline state, numeric scoring,
assignment, suppression and conversation history are preserved.

`import_sales_trip.py` creates a private dry plan first, checks live preconditions,
uses conditional updates, and individually reads every mutation back. Its only
write targets are Exotiq leads and research activities. It never drafts, sends,
enrolls, mirrors GHL, or changes sending gates. New records are unscored and held
from outreach. The import is deliberately conservative about multi-location
identity: reviewed canonical mappings preserve related records without deleting
histories. Complete identity candidates are checked for suppression before a
place-based preference. Batch guards cover places, contacts, previously planned
creations and repeated canonical targets.

Research plans, backups, receipts, business datasets and screenshots remain in a
private work directory outside Git. Never commit credentials or research exports.

## Evidence semantics
- Online address matching is not confirmation of visitor access, staffing, owner
  availability or a booked appointment. Call first.
- Service-area, unresolved, conflicting, closed, stale, unqualified and withheld
  residential locations receive no business driving directions.
- An appointment disposition requires actual source support, not a workaround for
  an unverified virtual office or a pickup-only garage.
- Google Places samples are relevance-selected, not necessarily newest. When a
  separately retrieved newest-first review sample is available, its ordering and
  capture basis are stated. Review text is attributed public customer opinion,
  not an independently established fact.
- Dated public Instagram metadata supports caption/date observations, not visual
  inspection or an exhaustive latest-feed claim. Unknown remains unknown.
- Advertised models/listings do not establish owned units or branch availability.
- Founder/leadership claims carry source and confidence. Registered agents,
  reviewer mentions and inferred email names are not owners.

## Routing
Jacksonville is a required personal stop without storing a friend's address.
Orlando is conditional. Navigation uses Google Maps exclusively. The corridor
figures are city-center OSRM drive-only estimates captured 2026-10-11, not live
traffic, exact business-stop mileage or a daily schedule. Exact visit scheduling
is intentionally deferred until meeting locations and dates are confirmed.

## Verification
```sh
python3 -m unittest scripts/test_import_sales_trip.py
npm run test:unit
npm run typecheck
npm run build
# With the local production server running and server-side credentials configured:
npx tsx scripts/qa_sales_trip.ts
```

The browser harness uses a no-email Supabase login token, blocks non-GET app API
requests, tests small/mobile/desktop widths, city and readiness filtering, evidence
expansion, canonical lead linkage, optional Orlando, old-trip reachability,
Google-only navigation, protected API behavior, and browser errors. Its live target
is restricted to localhost or the existing LeadsBySaul domain.

Release through Git/main → Netlify, verify the published commit, and rerun the
read-only browser harness at the stable production URL. A passing local build is
not proof of a successful production release.
