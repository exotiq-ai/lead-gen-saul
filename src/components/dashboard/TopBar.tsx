'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Warning, List, Sun, Moon } from '@phosphor-icons/react'
import useSWR from 'swr'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useTenantId, useTenantSlug } from '@/lib/hooks/useTenant'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/pipeline': 'Pipeline',
  '/dashboard/leads': 'Leads',
  '/dashboard/scoring': 'Scoring',
  '/dashboard/enrichment': 'Enrichment',
  '/dashboard/outreach': 'Outreach',
  '/dashboard/outreach/templates': 'Outreach Templates',
  '/dashboard/agents': 'Agents',
  '/dashboard/economics': 'Economics',
  '/dashboard/exports': 'Exports',
  '/dashboard/settings': 'Settings',
}

// Pages that actually consume the timeRange store. Showing the pills
// elsewhere is a UX lie -- clicks change a global value but no chart
// on the visible page rebinds to it. (Background note: the previous
// implementation showed the pills everywhere.)
const PAGES_WITH_TIMERANGE = new Set([
  '/dashboard',
  '/dashboard/economics',
])

const TIME_RANGES = [
  { label: '7d', value: '7d' as const },
  { label: '30d', value: '30d' as const },
  { label: '90d', value: '90d' as const },
  { label: 'All', value: 'all' as const },
]

interface TopBarProps {
  title?: string
}

export function TopBar({ title }: TopBarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tenantId = useTenantId()
  const tenantSlug = useTenantSlug()
  const timeRange = useDashboardStore((s) => s.timeRange)
  const setTimeRange = useDashboardStore((s) => s.setTimeRange)
  const theme = useDashboardStore((s) => s.theme)
  const toggleTheme = useDashboardStore((s) => s.toggleTheme)

  const { data: redFlagData } = useSWR(
    `/api/dashboard/red-flags?tenant_id=${tenantId}`,
    fetcher,
    { refreshInterval: 30_000 },
  )
  const redFlagCount: number = redFlagData?.count ?? 0

  const pageTitle = title ?? PAGE_TITLES[pathname] ?? 'Dashboard'
  const showTimeRange = PAGES_WITH_TIMERANGE.has(pathname)

  function navigateToRedFlags() {
    const params = new URLSearchParams(searchParams.toString())
    params.set('red_flags_only', 'true')
    if (!params.has('tenant')) params.set('tenant', tenantSlug)
    router.push(`/dashboard/leads?${params.toString()}`)
  }

  return (
    <header
      className="fixed top-0 left-0 lg:left-[240px] right-0 z-20 h-[60px] flex items-center justify-between px-4 md:px-6 bg-[var(--color-saul-bg-800)] border-b border-[var(--color-saul-border-soft)]"
    >
      <div className="flex items-center gap-3">
        {/* Hamburger menu — mobile only */}
        <button
          className="lg:hidden p-2 -ml-2 text-[var(--color-saul-text-secondary)] hover:text-[var(--color-saul-text-primary)] transition-colors"
          onClick={() => useSidebarStore.getState().toggle()}
          aria-label="Toggle navigation"
        >
          <List size={22} weight="bold" />
        </button>

        {/* Page title */}
        <h1 className="text-[15px] font-semibold text-[var(--color-saul-text-primary)] tracking-[-0.01em]">
          {pageTitle}
        </h1>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Time range pills — only on pages that bind to them */}
        {showTimeRange && (
          <div
            className="flex items-center gap-0.5 bg-[var(--color-saul-bg-900)] rounded-[6px] p-0.5 border border-[var(--color-saul-border-soft)]"
            role="group"
            aria-label="Time range"
          >
            {TIME_RANGES.map((r) => {
              const active = timeRange === r.value
              return (
                <button
                  key={r.value}
                  onClick={() => setTimeRange(r.value)}
                  className={[
                    'relative px-2.5 sm:px-3 py-1.5 text-[12px] font-semibold rounded-[4px] transition-colors duration-150',
                    active
                      ? 'text-[var(--color-saul-text-on-accent)]'
                      : 'text-[var(--color-saul-text-secondary)] hover:text-[var(--color-saul-text-primary)]',
                  ].join(' ')}
                  aria-pressed={active}
                >
                  {active && (
                    <motion.span
                      layoutId="topbar-time-pill"
                      className="absolute inset-0 rounded-[4px] bg-[var(--color-saul-cyan)]"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{r.label}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Red flag alert — clicks navigate to filtered Leads view */}
        <button
          onClick={navigateToRedFlags}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] bg-[var(--color-saul-danger)]/8 border border-[var(--color-saul-danger)]/15 hover:border-[var(--color-saul-danger)]/40 hover:bg-[var(--color-saul-danger)]/12 transition-all duration-200 cursor-pointer"
          title={`${redFlagCount} leads have red flags — click to filter`}
          aria-label={`${redFlagCount} red flag leads — click to view`}
        >
          <Warning size={14} weight="fill" className="text-[var(--color-saul-danger)]" />
          <span className="relative">
            <span className="text-[12px] font-bold text-[var(--color-saul-danger)] tabular-nums">
              {redFlagCount}
            </span>
            {redFlagCount > 0 && (
              <motion.span
                className="absolute -inset-1 rounded-full bg-[var(--color-saul-danger)] opacity-0"
                animate={{ opacity: [0, 0.3, 0], scale: [0.8, 1.4, 1.8] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3, ease: 'easeOut' }}
                aria-hidden="true"
              />
            )}
          </span>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center justify-center w-8 h-8 rounded-[6px] bg-[var(--color-saul-bg-600)] border border-[var(--color-saul-border-soft)] hover:border-[var(--color-saul-border)] hover:bg-[var(--color-saul-overlay-soft)] transition-all duration-150 text-[var(--color-saul-text-secondary)] hover:text-[var(--color-saul-text-primary)]"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? (
            <Sun size={16} weight="duotone" />
          ) : (
            <Moon size={16} weight="duotone" />
          )}
        </button>

        {/* User avatar */}
        <div
          className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--color-saul-bg-600)] border border-[var(--color-saul-border-soft)] select-none"
          title="Gregory R."
          aria-label="User: Gregory R."
        >
          <span className="text-[11px] font-bold text-[var(--color-saul-text-primary)] font-mono tracking-tight">
            GR
          </span>
        </div>
      </div>
    </header>
  )
}
