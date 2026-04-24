import { headers } from 'next/headers'
import { EconomicsPageClient } from './EconomicsPageClient'

export const dynamic = 'force-dynamic'

const DEMO_TENANT = '00000000-0000-0000-0000-000000000001'

export default async function EconomicsPage() {
  let data = null
  let error: string | null = null

  try {
    const headersList = await headers()
    const host = headersList.get('host') ?? 'localhost:3000'
    const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http'
    const res = await fetch(
      `${proto}://${host}/api/dashboard/economics?tenant_id=${DEMO_TENANT}`,
      { cache: 'no-store' },
    )
    if (res.ok) {
      data = await res.json()
    } else {
      error = `API returned ${res.status}`
    }
  } catch (err) {
    console.error('[EconomicsPage] fetch failed:', err)
    error = 'Failed to load economics data'
  }

  return <EconomicsPageClient data={data} error={error} />
}
