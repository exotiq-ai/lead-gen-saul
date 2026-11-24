import { Suspense } from 'react'
import { SalesWorkspace } from '@/components/sales/SalesWorkspace'
export default function TeamPage(){return <Suspense fallback={<p className="p-6">Loading team workspace…</p>}><SalesWorkspace administration /></Suspense>}
