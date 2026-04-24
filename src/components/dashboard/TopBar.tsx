'use client'

import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { Warning, List } from '@phosphor-icons/react'
import useSWR from 'swr'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useSidebarStore } from '@/stores/sidebarStore'

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const TENANT = '00000000-0000-0000-0000-000000000001'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/pipeline': 'Pipeline',
  '/dashboard/leads': 'Leads',
  '/dashboard/scoring': 'Scoring',
  '/dashboard/enrichment': 'Enrichment',
  '/dashboard/agents': 'Agents',
  '/dashboard/economics': 'Economics',
  '/dashboard/settings': 'Settings',
}

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
  const { timeRange, setTimeRange } = useDashboardStore()

  const { data: redFlagData } = useSWR(
    `/api/dashboard/red-flags?tenant_id=${TENANT}`,
    fetcher,
    { refreshInterval: 30_000 },
  )
  const redFlagCount: number = redFlagData?.count ?? 0

  const pageTitle = title ?? PAGE_TITLES[pathname] ?? 'Dashboard'

  return (
    <header
      className="fixed top-0 left-0 lg:left-[240px] right-0 z-20 h-[60px] flex items-center justify-between px-4 md:px-6 bg-[var(--color-saul-bg-800)]"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center gap-3">
        {/* Hamburger menu -- mobile only */}
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
      <div className="flex items-center gap-3">
        {/* Time range pills */}
        <div className="flex items-center gap-1 bg-[var(--color-saul-bg-900)] rounded-[6px] p-0.5">
          {TIME_RANGES.map((r) => {
            const active = timeRange === r.value
            return (
              <button
                key={r.value}
                onClick={() => setTimeRange(r.value)}
                className={[
                  'relative px-3 py-1.5 text-[12px] font-semibold rounded-[4px] transition-all duration-150',
                  active
                    ? 'text-[var(--color-saul-bg-900)]'
                    : 'text-[var(--color-saul-text-secondary)] hover:text-[var(--color-saul-text-primary)]',
                ].join(' ')}
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

        {/* Red flag alert badge */}
        <button
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] bg-[rgba(255,71,87,0.08)] border border-[rgba(255,71,87,0.15)] hover:border-[rgba(255,71,87,0.3)] transition-all duration-200"
          title={`${redFlagCount} leads have red flags`}
          aria-label={`${redFlagCount} red flag leads`}
        >
          <Warning size={15} weight="fill" className="text-[var(--color-saul-danger)]" />
          <span className="relative">
            <span className="text-[12px] font-bold text-[var(--color-saul-danger)]">
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

        {/* User avatar */}
        <div
          className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--color-saul-bg-600)] border border-[rgba(255,255,255,0.08)] select-none"
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
