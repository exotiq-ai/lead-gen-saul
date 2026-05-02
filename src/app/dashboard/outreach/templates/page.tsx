import type { Metadata } from 'next'
import { TemplatesPageClient } from './TemplatesPageClient'

export const metadata: Metadata = {
  title: 'Outreach Templates — Saul LeadGen',
}

export default function Page() {
  return <TemplatesPageClient />
}
