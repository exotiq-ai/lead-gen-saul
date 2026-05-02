'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ThemeProvider } from '@/components/dashboard/ThemeProvider'

const TENANTS: Record<string, { id: string; name: string; icon: string }> = {
  exotiq: {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Exotiq Inc.',
    icon: '🏎️',
  },
  'medspa-boulder': {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'MedSpa Boulder',
    icon: '💆',
  },
}

const DEFAULT_TENANT = 'exotiq'

function resolveTenant(param: string | null): string {
  if (param && TENANTS[param]) return param
  // Check if param is a UUID matching a tenant
  if (param) {
    const match = Object.entries(TENANTS).find(([, t]) => t.id === param)
    if (match) return match[0]
  }
  return DEFAULT_TENANT
}

interface DashboardClientLayoutProps {
  children: ReactNode
}

export function DashboardClientLayout({ children }: DashboardClientLayoutProps) {
  const searchParams = useSearchParams()
  const tenantSlug = resolveTenant(searchParams.get('tenant'))
  const tenant = TENANTS[tenantSlug]
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__SAUL_TENANT_ID__ = tenant.id
    }
  }, [tenant.id])

  return (
    <div className="relative">
      <ThemeProvider />
      {/* Tenant switcher — sits below topbar, above content, no overlap */}
      <div className="w-full px-4 py-2 border-b border-[var(--color-saul-border-soft)] bg-[var(--color-saul-bg-800)] flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-saul-text-tertiary)] uppercase tracking-wider">Tenant</span>
        <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--color-saul-border-strong)] bg-[var(--color-saul-bg-800)] hover:border-[color-mix(in_srgb,var(--color-saul-cyan)_30%,transparent)] transition-colors text-[12px]"
        >
          <span>{tenant.icon}</span>
          <span className="text-[var(--color-saul-text-primary)] font-medium">{tenant.name}</span>
          <span className="text-[var(--color-saul-text-tertiary)]">{open ? '▲' : '▼'}</span>
        </button>
        {open && (
          <div className="absolute right-0 mt-1 w-48 rounded-lg border border-[var(--color-saul-border-strong)] bg-[var(--color-saul-bg-700)] shadow-xl overflow-hidden">
            {Object.entries(TENANTS).map(([slug, t]) => (
              <a
                key={slug}
                href={`?tenant=${slug}`}
                className={[
                  'flex items-center gap-2 px-3 py-2.5 text-[12px] hover:bg-[color-mix(in_srgb,var(--color-saul-cyan)_8%,transparent)] transition-colors',
                  slug === tenantSlug
                    ? 'text-[var(--color-saul-cyan)] bg-[color-mix(in_srgb,var(--color-saul-cyan)_4%,transparent)]'
                    : 'text-[var(--color-saul-text-secondary)]',
                ].join(' ')}
                onClick={() => setOpen(false)}
              >
                <span>{t.icon}</span>
                <span>{t.name}</span>
                {slug === tenantSlug && <span className="ml-auto">✓</span>}
              </a>
            ))}
          </div>
        )}
        </div>
      </div>
      {children}
    </div>
  )
}

declare global {
  interface Window {
    __SAUL_TENANT_ID__?: string
  }
}
