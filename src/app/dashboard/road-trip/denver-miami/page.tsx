import { Suspense } from 'react'
import { DenverMiamiClient } from './DenverMiamiClient'

export default function DenverMiamiPage() {
  return <Suspense fallback={<p className="p-5" role="status">Loading trip…</p>}><DenverMiamiClient /></Suspense>
}
