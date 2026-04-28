import { headers } from 'next/headers'
import { EconomicsPageClient } from './EconomicsPageClient'

export const dynamic = 'force-dynamic'

const TENANT_MAP: Record<string, string> = {
  exotiq: '00000000-0000-0000-0000-000000000001',
  'medspa-boulder': '11111111-1111-1111-1111-111111111111',
}

interface Props {
  searchParams: Promise<{ tenant?: string }>
}

export default async function EconomicsPage({ searchParams }: Props) {
  const { tenant } = await searchParams
  const tenantId = (tenant && TENANT_MAP[tenant]) || TENANT_MAP.exotiq

  let data = null
  let error: string | null = null

  try {
    const headersList = await headers()
    const host = headersList.get('host') ?? 'localhost:3000'
    const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http'
    const res = await fetch(
      `${proto}://${host}/api/dashboard/economics?tenant_id=${tenantId}`,
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
