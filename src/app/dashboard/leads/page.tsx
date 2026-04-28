import { Suspense } from 'react'
import { LeadsPageClient } from './LeadsPageClient'

export const metadata = {
  title: 'Leads — Saul LeadGen',
}

export default function LeadsPage() {
  return (
    <Suspense fallback={null}>
      <LeadsPageClient />
    </Suspense>
  )
}
