import { Suspense } from 'react'
import { RoadTripPageClient } from './RoadTripPageClient'

export default function RoadTripPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] animate-pulse rounded-2xl bg-[var(--color-saul-bg-700)]" />}>
      <RoadTripPageClient />
    </Suspense>
  )
}
