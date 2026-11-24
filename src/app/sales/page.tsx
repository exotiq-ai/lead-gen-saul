import { Suspense } from 'react'
import { SalesWorkspace } from '@/components/sales/SalesWorkspace'
export default function SalesPage(){return <Suspense fallback={<p className="p-6">Loading your workspace…</p>}><SalesWorkspace /></Suspense>}
