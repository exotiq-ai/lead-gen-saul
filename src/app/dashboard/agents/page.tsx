import { Suspense } from 'react'
import { AgentsPageClient } from './AgentsPageClient'

export const metadata = {
  title: 'Agents | Saul LeadGen',
}

export default function AgentsPage() {
  return (
    <Suspense fallback={null}>
      <AgentsPageClient />
    </Suspense>
  )
}
