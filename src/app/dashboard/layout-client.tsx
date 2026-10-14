'use client'

import { type ReactNode, useState } from 'react'

import { usePathname } from 'next/navigation'
import { ThemeProvider } from '@/components/dashboard/ThemeProvider'
import { DemoProvider } from '@/lib/demo/DemoProvider'
import { useTenants, useTenantId } from '@/lib/hooks/useTenant'
import { useDashboardStore } from '@/stores/dashboardStore'

interface DashboardClientLayoutProps {
  children: ReactNode
}

export function DashboardClientLayout({ children }: DashboardClientLayoutProps) {
  const tenants = useTenants()
  const tenantId = useTenantId()
  const tenant = tenants.find(t => t.id === tenantId)
  const pathname = usePathname()
  const { setActiveTenantId } = useDashboardStore()
  const [open, setOpen] = useState(false)

  return (
    <DemoProvider>
    <div className="relative">
      <ThemeProvider />
      {/* Both selectors and data requests use the same catalog/resolver. */}
      <div className="w-full px-4 py-2 border-b border-[var(--color-saul-border-soft)] bg-[var(--color-saul-bg-800)] flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-saul-text-tertiary)] uppercase tracking-wider">Tenant</span>
        <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="dashboard-tenant-options"
          className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--color-saul-border-strong)] bg-[var(--color-saul-bg-800)] hover:border-[color-mix(in_srgb,var(--color-saul-cyan)_30%,transparent)] transition-colors text-[12px]"
        >
          <span>{tenant?.icon ?? '🏢'}</span>
          <span className="text-[var(--color-saul-text-primary)] font-medium">{tenant?.name ?? 'Select tenant'}</span>
          <span className="text-[var(--color-saul-text-tertiary)]">{open ? '▲' : '▼'}</span>
        </button>
        {open && (
          <div id="dashboard-tenant-options" className="absolute left-0 z-40 mt-1 w-48 rounded-lg border border-[var(--color-saul-border-strong)] bg-[var(--color-saul-bg-700)] shadow-xl overflow-hidden">
            {tenants.map(t => (
              <a
                key={t.id}
                href={`${pathname}?tenant=${encodeURIComponent(t.slug)}`}

                className={[
                  'flex items-center gap-2 px-3 py-2.5 text-[12px] hover:bg-[color-mix(in_srgb,var(--color-saul-cyan)_8%,transparent)] transition-colors',
                  t.id === tenantId
                    ? 'text-[var(--color-saul-cyan)] bg-[color-mix(in_srgb,var(--color-saul-cyan)_4%,transparent)]'
                    : 'text-[var(--color-saul-text-secondary)]',
                ].join(' ')}
                onClick={() => {
                  setActiveTenantId(t.id)
                  setOpen(false)
                }}
              >
                <span>{t.icon}</span>
                <span>{t.name}</span>
                {t.id === tenantId && <span className="ml-auto">✓</span>}
              </a>
            ))}
          </div>
        )}
        </div>
        <a
          href="/auth/logout"
          className="ml-auto text-[11px] font-medium text-[var(--color-saul-text-tertiary)] hover:text-[var(--color-saul-cyan)]"
        >
          Sign out
        </a>
      </div>
      {tenant ? <div key={tenantId}>{children}</div> : (
        <p role="status" className="p-4 text-sm text-[var(--color-saul-text-secondary)]">
          This tenant is unavailable or still loading. Select a tenant above to continue.
        </p>
      )}
    </div>
    </DemoProvider>
  )
}
