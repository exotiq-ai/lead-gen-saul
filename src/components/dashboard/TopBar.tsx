'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Warning, List, Sun, Moon, Export, Sparkle, MagnifyingGlass, X } from '@phosphor-icons/react'
import useSWR from 'swr'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useTenantId, useTenantSlug } from '@/lib/hooks/useTenant'
import { useDemo } from '@/lib/demo/DemoProvider'
import { exportElementAsPng } from '@/lib/utils/exportPng'
import { DailyBrief } from './DailyBrief'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/pipeline': 'Pipeline',
  '/dashboard/leads': 'Leads',
  '/dashboard/scoring': 'Scoring',
  '/dashboard/enrichment': 'Enrichment',
  '/dashboard/outreach': 'Outreach',
  '/dashboard/outreach/templates': 'Outreach Templates',
  '/dashboard/guide': 'Exotiq GTM Guide',
  '/dashboard/agents': 'Agents',
  '/dashboard/economics': 'Economics',
  '/dashboard/roi': 'ROI',
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

interface GlobalLeadSearchResult {
  id: string
  company_name: string | null
  first_name: string | null
  last_name: string | null
  company_location: string | null
  status: string | null
  score: number | null
}

function GlobalLeadSearch() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tenantId = useTenantId()
  const tenantSlug = useTenantSlug()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const normalizedQuery = query.trim()
  const shouldSearch = normalizedQuery.length >= 2
  const searchUrl = useMemo(() => {
    if (!shouldSearch) return null
    const params = new URLSearchParams({
      tenant_id: tenantId,
      search: normalizedQuery,
      limit: '8',
      sort: 'activity_desc',
    })
    return `/api/leads?${params.toString()}`
  }, [normalizedQuery, shouldSearch, tenantId])
  const { data, isLoading } = useSWR(searchUrl, fetcher, { keepPreviousData: true })
  const results: GlobalLeadSearchResult[] = data?.data ?? []

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setFocused(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [])

  function openLead(leadId: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (!params.has('tenant')) params.set('tenant', tenantSlug)
    setFocused(false)
    setQuery('')
    router.push(`/dashboard/leads/${leadId}?${params.toString()}`)
  }

  function openLeadSearch() {
    if (!normalizedQuery) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('search', normalizedQuery)
    if (!params.has('tenant')) params.set('tenant', tenantSlug)
    setFocused(false)
    router.push(`/dashboard/leads?${params.toString()}`)
  }

  return (
    <div ref={boxRef} className="relative hidden md:block w-[280px] lg:w-[360px] xl:w-[440px]">
      <label htmlFor="global-lead-search" className="sr-only">Search Exotiq leads</label>
      <MagnifyingGlass
        size={15}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-saul-text-muted)] pointer-events-none"
      />
      <input
        id="global-lead-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') openLeadSearch()
          if (e.key === 'Escape') setFocused(false)
        }}
        placeholder="Search leads, companies, owners, phone, email…"
        className="w-full h-9 pl-9 pr-8 text-[13px] bg-[var(--color-saul-bg-600)] border border-[var(--color-saul-border-soft)] rounded-[8px] text-[var(--color-saul-text-primary)] placeholder:text-[var(--color-saul-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-saul-cyan)]/40 focus:border-[var(--color-saul-cyan)]/50 transition-all"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-saul-text-muted)] hover:text-[var(--color-saul-text-primary)]"
          aria-label="Clear search"
        >
          <X size={13} weight="bold" />
        </button>
      )}

      {focused && shouldSearch && (
        <div className="absolute top-[42px] left-0 right-0 rounded-[10px] border border-[var(--color-saul-border)] bg-[var(--color-saul-bg-700)] shadow-xl overflow-hidden z-50">
          {isLoading && results.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-[var(--color-saul-text-secondary)]">Searching…</div>
          ) : results.length > 0 ? (
            <>
              {results.map((lead) => {
                const contactName = [lead.first_name, lead.last_name].filter(Boolean).join(' ')
                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => openLead(lead.id)}
                    className="w-full text-left px-3 py-2.5 border-b last:border-b-0 border-[var(--color-saul-border-soft)] hover:bg-[var(--color-saul-overlay-soft)] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[13px] font-semibold text-[var(--color-saul-text-primary)] truncate">
                        {lead.company_name ?? contactName ?? 'Unnamed lead'}
                      </span>
                      {lead.score != null && (
                        <span className="text-[11px] font-mono text-[var(--color-saul-cyan)] shrink-0">{lead.score}</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--color-saul-text-muted)]">
                      {contactName && <span className="truncate">{contactName}</span>}
                      {lead.company_location && <span className="truncate">{lead.company_location}</span>}
                      {lead.status && <span className="uppercase tracking-wide shrink-0">{lead.status}</span>}
                    </div>
                  </button>
                )
              })}
              <button
                type="button"
                onClick={openLeadSearch}
                className="w-full px-3 py-2 text-left text-[12px] font-semibold text-[var(--color-saul-cyan)] hover:bg-[var(--color-saul-overlay-soft)]"
              >
                View all results for “{normalizedQuery}”
              </button>
            </>
          ) : (
            <div className="px-3 py-3 text-[12px] text-[var(--color-saul-text-secondary)]">No matching leads</div>
          )}
        </div>
      )}
    </div>
  )
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
  const isDemo = useDemo()
  const [isExporting, setIsExporting] = useState(false)
  const [briefOpen, setBriefOpen] = useState(false)

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

  async function handlePageExport() {
    const main = document.querySelector('main')
    if (!main || isExporting) return
    setIsExporting(true)
    try {
      const pageName = (PAGE_TITLES[pathname] ?? 'dashboard').toLowerCase().replace(/\s+/g, '-')
      const date = new Date().toISOString().slice(0, 10)
      await exportElementAsPng(main as HTMLElement, `saul-${pageName}-${date}.png`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <header
      className="fixed top-0 left-0 lg:left-[240px] right-0 z-20 h-[60px] flex items-center justify-between px-4 md:px-6 bg-[var(--color-saul-bg-800)] border-b border-[var(--color-saul-border-soft)]"
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger menu — mobile only */}
        <button
          className="lg:hidden p-2 -ml-2 text-[var(--color-saul-text-secondary)] hover:text-[var(--color-saul-text-primary)] transition-colors"
          onClick={() => useSidebarStore.getState().toggle()}
          aria-label="Toggle navigation"
        >
          <List size={22} weight="bold" />
        </button>

        {/* Page title */}
        <h1 className="text-[15px] font-semibold text-[var(--color-saul-text-primary)] tracking-[-0.01em] truncate">
          {pageTitle}
        </h1>

        {/* Demo mode badge */}
        {isDemo && (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-[color-mix(in_srgb,var(--color-saul-cyan)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-saul-cyan)_25%,transparent)] text-[var(--color-saul-cyan)]">
            Demo
          </span>
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <GlobalLeadSearch />

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

        {/* Page export */}
        <button
          onClick={handlePageExport}
          disabled={isExporting}
          className="flex items-center justify-center w-8 h-8 rounded-[6px] bg-[var(--color-saul-bg-600)] border border-[var(--color-saul-border-soft)] hover:border-[var(--color-saul-border)] hover:bg-[var(--color-saul-overlay-soft)] transition-all duration-150 text-[var(--color-saul-text-secondary)] hover:text-[var(--color-saul-text-primary)] disabled:opacity-50 cursor-pointer"
          title="Export page as PNG"
          aria-label="Export page as PNG"
        >
          <Export size={16} weight="duotone" className={isExporting ? 'animate-pulse' : ''} />
        </button>

        {/* Daily Brief drawer trigger */}
        <button
          onClick={() => setBriefOpen((v) => !v)}
          className={[
            'flex items-center justify-center w-8 h-8 rounded-[6px] border transition-all duration-150 cursor-pointer',
            briefOpen
              ? 'bg-[var(--color-saul-cyan)]/12 border-[var(--color-saul-cyan)]/30 text-[var(--color-saul-cyan)]'
              : 'bg-[var(--color-saul-bg-600)] border-[var(--color-saul-border-soft)] hover:border-[var(--color-saul-border)] hover:bg-[var(--color-saul-overlay-soft)] text-[var(--color-saul-text-secondary)] hover:text-[var(--color-saul-text-primary)]',
          ].join(' ')}
          title="Open daily brief"
          aria-label="Open daily brief"
          aria-pressed={briefOpen}
        >
          <Sparkle size={16} weight="duotone" />
        </button>

        {/* Red flag alert — clicks navigate to filtered Leads view */}
        <button
          onClick={navigateToRedFlags}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] bg-[var(--color-saul-warning)]/8 border border-[var(--color-saul-warning)]/15 hover:border-[var(--color-saul-warning)]/40 hover:bg-[var(--color-saul-warning)]/12 transition-all duration-200 cursor-pointer"
          title={`${redFlagCount} leads have red flags — click to filter`}
          aria-label={`${redFlagCount} red flag leads — click to view`}
        >
          <Warning size={14} weight="fill" className="text-[var(--color-saul-warning)]" />
          <span className="relative">
            <span className="text-[12px] font-bold text-[var(--color-saul-warning)] tabular-nums">
              {redFlagCount}
            </span>
            {redFlagCount > 0 && (
              <motion.span
                className="absolute -inset-1 rounded-full bg-[var(--color-saul-warning)] opacity-0"
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

      <DailyBrief isOpen={briefOpen} onClose={() => setBriefOpen(false)} />
    </header>
  )
}
