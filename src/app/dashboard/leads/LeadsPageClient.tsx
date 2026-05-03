'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MagnifyingGlass,
  Warning,
  Car,
  X,
  CaretDown,
  CaretLeft,
  CaretRight,
  ArrowsDownUp,
  UploadSimple,
  DownloadSimple,
} from '@phosphor-icons/react'
import useSWR from 'swr'
import { useFilterStore } from '@/stores/filterStore'
import { useTenantId } from '@/lib/hooks/useTenant'
import { LeadRow } from '@/components/leads/LeadRow'
import { CsvImportModal } from '@/components/leads/CsvImportModal'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Lead, LeadStatus } from '@/types/lead'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PAGE_SIZE = 50

const STAGE_OPTIONS: Array<{ value: LeadStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'outreach', label: 'Contacted' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'converted', label: 'Won' },
  { value: 'lost', label: 'Lost' },
]

const SORT_OPTIONS = [
  { value: 'score_desc', label: 'Score: High → Low' },
  { value: 'score_asc', label: 'Score: Low → High' },
  { value: 'newest', label: 'Newest First' },
  { value: 'last_active', label: 'Last Active' },
]

const TABLE_HEADERS = [
  { label: 'Company', width: 'w-[180px]' },
  { label: 'Industry / Fleet', width: 'w-[160px]' },
  { label: 'Source', width: 'w-[90px]' },
  { label: 'Score', width: 'w-[72px]' },
  { label: 'Stage', width: 'w-[100px]' },
  { label: 'Assigned', width: 'w-[80px]' },
  { label: 'Red Flags', width: 'w-[100px]' },
  { label: 'Last Active', width: 'w-[110px]' },
  { label: '', width: 'w-8' },
]

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------
interface LeadsResponse {
  data: Lead[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
    offset: number
    red_flag_count: number
    gregory_count: number
    converted_this_month: number
  }
}

function fetcher(url: string): Promise<LeadsResponse> {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error('Failed to fetch leads')
    return r.json()
  })
}

// ---------------------------------------------------------------------------
// Debounce hook
// ---------------------------------------------------------------------------
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ---------------------------------------------------------------------------
// Pill button
// ---------------------------------------------------------------------------
interface PillProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  danger?: boolean
  className?: string
}

function Pill({ active, onClick, children, danger = false, className = '' }: PillProps) {
  return (
    <button
      onClick={onClick}
      className={[
        'h-7 px-3 text-[12px] font-medium rounded-[6px] border transition-all duration-150 cursor-pointer whitespace-nowrap leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-saul-cyan)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-saul-bg-800)]',
        active && !danger
          ? 'bg-[color-mix(in_srgb,var(--color-saul-cyan)_15%,transparent)] text-[var(--color-saul-cyan)] border-[color-mix(in_srgb,var(--color-saul-cyan)_30%,transparent)]'
          : active && danger
            ? 'bg-[color-mix(in_srgb,var(--color-saul-danger)_15%,transparent)] text-[var(--color-saul-danger)] border-[color-mix(in_srgb,var(--color-saul-danger)_30%,transparent)]'
            : 'bg-transparent text-[var(--color-saul-text-secondary)] border-[var(--color-saul-border)] hover:border-[var(--color-saul-border-strong)] hover:text-[var(--color-saul-text-primary)] hover:bg-[var(--color-saul-overlay-soft)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Sort dropdown
// ---------------------------------------------------------------------------
interface SortDropdownProps {
  value: string
  onChange: (v: string) => void
}

function SortDropdown({ value, onChange }: SortDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const label = SORT_OPTIONS.find((o) => o.value === value)?.label ?? 'Sort'

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="h-7 px-3 flex items-center gap-1.5 text-[12px] font-medium rounded-[6px] border transition-all duration-150 cursor-pointer bg-transparent text-[var(--color-saul-text-secondary)] border-[var(--color-saul-border)] hover:border-[var(--color-saul-border-strong)] hover:text-[var(--color-saul-text-primary)] hover:bg-[var(--color-saul-overlay-soft)] whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-saul-cyan)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-saul-bg-800)]"
      >
        <ArrowsDownUp size={12} weight="bold" />
        {label}
        <CaretDown
          size={10}
          weight="bold"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute top-[calc(100%+4px)] right-0 z-50 min-w-[180px] rounded-[7px] border border-[var(--color-saul-border-strong)] bg-[var(--color-saul-bg-700)] shadow-[0_8px_32px_var(--color-saul-shadow)] overflow-hidden"
          >
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={[
                  'w-full px-3 py-2 text-left text-[12px] transition-colors duration-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-saul-cyan)] focus-visible:ring-inset',
                  value === opt.value
                    ? 'text-[var(--color-saul-cyan)] bg-[color-mix(in_srgb,var(--color-saul-cyan)_8%,transparent)]'
                    : 'text-[var(--color-saul-text-secondary)] hover:text-[var(--color-saul-text-primary)] hover:bg-[var(--color-saul-overlay-low)]',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton rows matching table shape
// ---------------------------------------------------------------------------
function SkeletonTableRows() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <tr key={i} className="border-b border-[var(--color-saul-border-soft)] last:border-0" aria-hidden="true">
          {/* Company */}
          <td className="px-4 py-2.5">
            <div className="flex flex-col gap-1.5">
              <div className="skeleton-shimmer h-3 w-28 rounded-[3px]" />
              <div className="skeleton-shimmer h-2.5 w-16 rounded-[3px]" />
            </div>
          </td>
          {/* Industry */}
          <td className="px-4 py-2.5">
            <div className="flex flex-col gap-1.5">
              <div className="skeleton-shimmer h-3 w-24 rounded-[3px]" />
              <div className="skeleton-shimmer h-2.5 w-14 rounded-[3px]" />
            </div>
          </td>
          {/* Source */}
          <td className="px-4 py-2.5">
            <div className="skeleton-shimmer h-5 w-14 rounded-[4px]" />
          </td>
          {/* Score */}
          <td className="px-4 py-2.5">
            <div className="skeleton-shimmer h-9 w-12 rounded-[5px]" />
          </td>
          {/* Stage */}
          <td className="px-4 py-2.5">
            <div className="skeleton-shimmer h-5 w-16 rounded-[4px]" />
          </td>
          {/* Assigned */}
          <td className="px-4 py-2.5">
            <div className="skeleton-shimmer w-6 h-6 rounded-full" />
          </td>
          {/* Flags */}
          <td className="px-4 py-2.5">
            <div className="skeleton-shimmer h-4 w-4 rounded-[3px]" />
          </td>
          {/* Last active */}
          <td className="px-4 py-2.5">
            <div className="skeleton-shimmer h-3 w-20 rounded-[3px]" />
          </td>
          {/* Arrow */}
          <td className="px-3 py-2.5 w-8" />
        </tr>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Empty state — wraps the shared <EmptyState/> in a table row so it spans
// every column and stays vertically centered inside the table body.
// ---------------------------------------------------------------------------
function LeadsEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <tr>
      <td colSpan={9}>
        <EmptyState
          icon={Car}
          title="No leads match your filters"
          description="Try adjusting or clearing your current filters."
          action={
            <button
              type="button"
              onClick={onClear}
              className="h-7 px-3 text-[12px] font-medium rounded-[6px] border cursor-pointer transition-all duration-150 bg-[color-mix(in_srgb,var(--color-saul-cyan)_10%,transparent)] text-[var(--color-saul-cyan)] border-[color-mix(in_srgb,var(--color-saul-cyan)_22%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-saul-cyan)_16%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-saul-cyan)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-saul-bg-800)]"
            >
              Clear filters
            </button>
          }
          className="py-12"
        />
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Stats row
// ---------------------------------------------------------------------------
interface StatsRowProps {
  total: number
  redFlagCount: number
  gregoryCount: number
  convertedThisMonth: number
  onRedFlagClick: () => void
  onGregoryClick: () => void
  loading: boolean
}

function StatsRow({
  total,
  redFlagCount,
  gregoryCount,
  convertedThisMonth,
  onRedFlagClick,
  onGregoryClick,
  loading,
}: StatsRowProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-5 px-1 py-2" aria-hidden="true">
        {[80, 70, 90, 75].map((w, i) => (
          <div key={i} className={`skeleton-shimmer h-3 rounded-[3px]`} style={{ width: w }} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-5 px-1 py-2 flex-wrap">
      <span className="text-[12px] font-mono font-semibold text-[var(--color-saul-text-primary)] tabular-nums">
        {total.toLocaleString()}{' '}
        <span className="font-normal text-[var(--color-saul-text-secondary)]">leads</span>
      </span>

      <button
        onClick={onRedFlagClick}
        className="text-[12px] font-mono font-semibold tabular-nums transition-opacity duration-150 hover:opacity-80 cursor-pointer text-[var(--color-saul-danger)]"
      >
        {redFlagCount}{' '}
        <span className="font-normal">red flags</span>
      </button>

      <button
        onClick={onGregoryClick}
        className="text-[12px] font-mono font-semibold tabular-nums transition-opacity duration-150 hover:opacity-80 cursor-pointer text-[var(--color-saul-cyan)]"
      >
        {gregoryCount}{' '}
        <span className="font-normal text-[var(--color-saul-text-secondary)]">Gregory leads</span>
      </button>

      <span className="text-[12px] font-mono font-semibold text-[var(--color-saul-success)] tabular-nums">
        {convertedThisMonth}{' '}
        <span className="font-normal text-[var(--color-saul-text-secondary)]">converted this month</span>
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function LeadsPageClient() {
  const router = useRouter()

  // Filter store
  const {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    assignedToFilter,
    setAssignedToFilter,
    redFlagsOnly,
    setRedFlagsOnly,
    clearFilters,
  } = useFilterStore()

  // Local state
  const [sort, setSort] = useState('score_desc')
  const [jumpInput, setJumpInput] = useState('')
  const [showImport, setShowImport] = useState(false)

  const debouncedSearch = useDebounce(search, 300)

  // Reset to page 1 when filters change. Storing the previous filter key in
  // state and comparing during render is the React-19-blessed pattern for
  // "derived state that resets on prop/dep change". setState-during-render
  // is fine; setState-in-effect is what the lint rule blocks.
  const filterKey = `${debouncedSearch}|${statusFilter.join(',')}|${assignedToFilter}|${redFlagsOnly}|${sort}`
  const [page, setPage] = useState(1)
  const [lastFilterKey, setLastFilterKey] = useState(filterKey)
  if (lastFilterKey !== filterKey) {
    setLastFilterKey(filterKey)
    setPage(1)
  }

  const tenantId = useTenantId()

  // Build API URL
  const buildUrl = useCallback(() => {
    const params = new URLSearchParams()
    params.set('tenant_id', tenantId)
    params.set('page', String(page))
    params.set('limit', String(PAGE_SIZE))
    params.set('sort', sort)
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (assignedToFilter !== 'all') params.set('assigned_to', assignedToFilter)
    if (redFlagsOnly) params.set('red_flags_only', 'true')
    statusFilter.forEach((s) => params.append('status', s))
    return `/api/leads?${params.toString()}`
  }, [page, sort, debouncedSearch, assignedToFilter, redFlagsOnly, statusFilter])

  const { data, isLoading, error, mutate } = useSWR<LeadsResponse>(buildUrl(), fetcher, {
    keepPreviousData: true,
  })

  const leads = data?.data ?? []
  const meta = data?.meta

  // Stage promotion handler
  const handleStageChange = async (leadId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, tenant_id: tenantId }),
      })
      if (res.ok) void mutate()
    } catch (err) {
      console.error('[stage-change]', err)
    }
  }

  // Determine if any filters are active
  const hasActiveFilters =
    !!search ||
    statusFilter.length > 0 ||
    assignedToFilter !== 'all' ||
    redFlagsOnly

  // Stage pill toggle
  function toggleStatus(val: LeadStatus | 'all') {
    if (val === 'all') {
      setStatusFilter([])
      return
    }
    if (statusFilter.includes(val)) {
      setStatusFilter(statusFilter.filter((s) => s !== val))
    } else {
      setStatusFilter([...statusFilter, val])
    }
  }

  // Jump to page
  function handleJump(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return
    const n = parseInt(jumpInput, 10)
    if (!isNaN(n) && n >= 1 && meta && n <= meta.totalPages) {
      setPage(n)
      setJumpInput('')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-[18px] font-semibold text-[var(--color-saul-text-primary)] tracking-tight">
          Leads
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!leads.length) return
              const headers = ['company_name','first_name','last_name','email','phone','source','score','status','city','state','last_activity_at']
              const rows = leads.map((l) => headers.map((h) => {
                const v = (l as unknown as Record<string, unknown>)[h]
                const s = v == null ? '' : String(v)
                return s.includes(',') ? `"${s}"` : s
              }).join(','))
              const csv = [headers.join(','), ...rows].join('\n')
              const blob = new Blob([csv], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url; a.download = `leads-export-${new Date().toISOString().slice(0,10)}.csv`
              a.click(); URL.revokeObjectURL(url)
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-[var(--color-saul-bg-600)] border border-[var(--color-saul-border-strong)] text-[12px] font-medium text-[var(--color-saul-text-secondary)] hover:text-[var(--color-saul-text-primary)] hover:border-[color-mix(in_srgb,var(--color-saul-cyan)_30%,transparent)] hover:bg-[var(--color-saul-overlay-soft)] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-saul-cyan)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-saul-bg-800)]"
          >
            <DownloadSimple size={14} weight="bold" />
            Export CSV
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-[var(--color-saul-bg-600)] border border-[var(--color-saul-border-strong)] text-[12px] font-medium text-[var(--color-saul-text-secondary)] hover:text-[var(--color-saul-text-primary)] hover:border-[color-mix(in_srgb,var(--color-saul-cyan)_30%,transparent)] hover:bg-[var(--color-saul-overlay-soft)] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-saul-cyan)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-saul-bg-800)]"
          >
            <UploadSimple size={14} weight="bold" />
            Import CSV
          </button>
        </div>
      </div>

      <CsvImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        tenantId={tenantId}
        onSuccess={() => void mutate()}
      />

      {/* ── Filter bar ── */}
      <div className="flex flex-col gap-2 p-3 rounded-[8px] bg-[var(--color-saul-bg-700)] border border-[var(--color-saul-border)]">
        {/* Row 1: search + assigned + red flags + sort */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-[280px]">
            <MagnifyingGlass
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-saul-text-tertiary)] pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company, owner…"
              className="w-full h-7 pl-7 pr-3 text-[12px] bg-[var(--color-saul-bg-600)] border border-[var(--color-saul-border)] rounded-[6px] text-[var(--color-saul-text-primary)] placeholder:text-[var(--color-saul-text-tertiary)] outline-none focus:border-[color-mix(in_srgb,var(--color-saul-cyan)_35%,transparent)] transition-colors duration-150"
            />
          </div>

          <div className="h-5 w-px bg-[var(--color-saul-border)]" />

          {/* Assigned filter */}
          {(['all', 'gregory', 'team'] as const).map((v) => (
            <Pill
              key={v}
              active={assignedToFilter === v}
              onClick={() => setAssignedToFilter(v)}
            >
              {v === 'all' ? 'All' : v === 'gregory' ? 'Gregory' : 'Team'}
            </Pill>
          ))}

          <div className="h-5 w-px bg-[var(--color-saul-border)]" />

          {/* Red flags toggle */}
          <Pill
            active={redFlagsOnly}
            danger
            onClick={() => setRedFlagsOnly(!redFlagsOnly)}
          >
            <span className="flex items-center gap-1">
              <Warning size={11} weight="fill" />
              Red flags only
            </span>
          </Pill>

          <div className="ml-auto flex items-center gap-2">
            <SortDropdown value={sort} onChange={setSort} />

            {/* Clear filters */}
            <AnimatePresence>
              {hasActiveFilters && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ duration: 0.12 }}
                  onClick={clearFilters}
                  className="h-7 px-2.5 flex items-center gap-1 text-[11px] font-medium rounded-[6px] border transition-all duration-150 cursor-pointer bg-transparent text-[var(--color-saul-text-tertiary)] border-[var(--color-saul-border)] hover:border-[var(--color-saul-border-strong)] hover:text-[var(--color-saul-text-primary)]"
                >
                  <X size={10} weight="bold" />
                  Clear
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Row 2: Stage pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {STAGE_OPTIONS.map((opt) => (
            <Pill
              key={opt.value}
              active={
                opt.value === 'all'
                  ? statusFilter.length === 0
                  : statusFilter.includes(opt.value as LeadStatus)
              }
              onClick={() => toggleStatus(opt.value)}
            >
              {opt.label}
            </Pill>
          ))}
        </div>
      </div>

      {/* ── Stats row ── */}
      <StatsRow
        total={meta?.total ?? 0}
        redFlagCount={meta?.red_flag_count ?? 0}
        gregoryCount={meta?.gregory_count ?? 0}
        convertedThisMonth={meta?.converted_this_month ?? 0}
        loading={isLoading && !data}
        onRedFlagClick={() => {
          setRedFlagsOnly(true)
          setPage(1)
        }}
        onGregoryClick={() => {
          setAssignedToFilter('gregory')
          setPage(1)
        }}
      />

      {/* ── Table ── */}
      <div className="rounded-[8px] border border-[var(--color-saul-border)] overflow-hidden">
        {error ? (
          <div className="flex items-center justify-center py-16 text-[13px] text-[var(--color-saul-danger)]">
            Failed to load leads. Please try again.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse">
              {/* Sticky header */}
              <thead className="sticky top-0 z-10 bg-[var(--color-saul-bg-600)]">
                <tr className="border-b border-[var(--color-saul-border)]">
                  {TABLE_HEADERS.map((h, i) => (
                    <th
                      key={i}
                      className={[
                        'px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-saul-text-tertiary)]',
                        h.width,
                        i >= 1 && i <= 5 ? 'hidden md:table-cell' : '',
                      ].join(' ')}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-[var(--color-saul-border-soft)]">
                {isLoading && leads.length === 0 ? (
                  <SkeletonTableRows />
                ) : leads.length === 0 ? (
                  <LeadsEmptyState onClear={clearFilters} />
                ) : (
                  leads.map((lead, i) => (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      index={i}
                      onClick={() => router.push(`/dashboard/leads/${lead.id}?tenant=${tenantId}`)}  
                      onStageChange={handleStageChange}
                      onStatusClick={(status) => {
                        if (!statusFilter.includes(status)) {
                          setStatusFilter([status])
                        }
                      }}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between px-1 py-1">
          {/* Range info */}
          <span className="text-[11px] font-mono text-[var(--color-saul-text-secondary)] tabular-nums">
            {meta.offset + 1}–{Math.min(meta.offset + PAGE_SIZE, meta.total)} of{' '}
            {meta.total.toLocaleString()} leads
          </span>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* Jump to page */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[var(--color-saul-text-tertiary)]">Go to</span>
              <input
                type="number"
                min={1}
                max={meta.totalPages}
                value={jumpInput}
                onChange={(e) => setJumpInput(e.target.value)}
                onKeyDown={handleJump}
                placeholder={String(page)}
                className="w-12 h-7 px-2 text-[11px] font-mono text-center bg-[var(--color-saul-bg-600)] border border-[var(--color-saul-border)] rounded-[5px] text-[var(--color-saul-text-primary)] outline-none focus:border-[color-mix(in_srgb,var(--color-saul-cyan)_35%,transparent)] transition-colors duration-150 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>

            <div className="h-5 w-px bg-[var(--color-saul-border)]" />

            {/* Page X of Y */}
            <span className="text-[11px] font-mono text-[var(--color-saul-text-secondary)] tabular-nums">
              Page {page} of {meta.totalPages}
            </span>

            {/* Prev / Next */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="w-7 h-7 flex items-center justify-center rounded-[5px] border border-[var(--color-saul-border)] bg-transparent text-[var(--color-saul-text-secondary)] transition-all duration-150 cursor-pointer hover:border-[var(--color-saul-border-strong)] hover:text-[var(--color-saul-text-primary)] hover:bg-[var(--color-saul-overlay-soft)] disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-saul-cyan)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-saul-bg-800)]"
              >
                <CaretLeft size={12} weight="bold" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page >= meta.totalPages}
                className="w-7 h-7 flex items-center justify-center rounded-[5px] border border-[var(--color-saul-border)] bg-transparent text-[var(--color-saul-text-secondary)] transition-all duration-150 cursor-pointer hover:border-[var(--color-saul-border-strong)] hover:text-[var(--color-saul-text-primary)] hover:bg-[var(--color-saul-overlay-soft)] disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-saul-cyan)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-saul-bg-800)]"
              >
                <CaretRight size={12} weight="bold" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
