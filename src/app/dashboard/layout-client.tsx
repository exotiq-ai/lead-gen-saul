'use client'

import { type ReactNode, useEffect } from 'react'

const EXOTIQ_TENANT_ID = 'exotiq'

interface DashboardClientLayoutProps {
  children: ReactNode
}

export function DashboardClientLayout({ children }: DashboardClientLayoutProps) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__SAUL_TENANT_ID__ = EXOTIQ_TENANT_ID
    }
  }, [])

  return <>{children}</>
}

declare global {
  interface Window {
    __SAUL_TENANT_ID__?: string
  }
}
