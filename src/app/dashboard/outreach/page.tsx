import { Suspense } from 'react'
import { OutreachPageClient } from './OutreachPageClient'

export const metadata = {
  title: 'Outreach | Saul LeadGen',
}

export default function OutreachPage() {
  return (
    <Suspense fallback={null}>
      <OutreachPageClient />
    </Suspense>
  )
}
