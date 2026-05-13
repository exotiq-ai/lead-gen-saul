import { Suspense } from 'react'
import { ROIPageClient } from './ROIPageClient'

export default function ROIPage() {
  return (
    <Suspense fallback={null}>
      <ROIPageClient />
    </Suspense>
  )
}
