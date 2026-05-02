import type { Metadata } from 'next'
import { ExportsPageClient } from './ExportsPageClient'

export const metadata: Metadata = {
  title: 'Exports — Saul LeadGen',
}

export default function Page() {
  return <ExportsPageClient />
}
