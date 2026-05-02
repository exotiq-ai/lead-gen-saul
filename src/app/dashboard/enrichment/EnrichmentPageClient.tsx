'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { formatCurrency, formatRelative, formatPercent } from '@/lib/utils/formatters'

export interface EnrichmentData {
  status_counts: {
    pending: number
    processing: number
    completed: number
    failed: number
    skipped: number
  }
  enrichment_coverage_pct: number
  total_cost_cents: number
  by_provider: Array<{
    provider: string
    count: number
    completed: number
    failed: number
    total_cost_cents: number
    avg_cost_cents: number
    success_rate: number
  }>
  recent: Array<{
    id: string
    company_name: string
    provider: string
    status: string
    cost_cents: number
    created_at: string
  }>
}

interface EnrichmentPageClientProps {
  data: EnrichmentData
}

const STATUS_CONFIG: Record<
  string,
  { dot: string; bg: string; label: string; pulse?: boolean }
> = {
  pending: {
    dot: 'var(--color-saul-warning)',
    bg: 'color-mix(in srgb, var(--color-saul-warning) 8%, transparent)',
    label: 'Pending',
  },
  processing: {
    dot: 'var(--color-saul-info)',
    bg: 'color-mix(in srgb, var(--color-saul-info) 8%, transparent)',
    label: 'Processing',
    pulse: true,
  },
  completed: {
    dot: 'var(--color-saul-cyan)',
    bg: 'color-mix(in srgb, var(--color-saul-cyan) 8%, transparent)',
    label: 'Completed',
  },
  failed: {
    dot: 'var(--color-saul-danger)',
    bg: 'color-mix(in srgb, var(--color-saul-danger) 8%, transparent)',
    label: 'Failed',
  },
  skipped: {
    dot: 'var(--color-saul-text-tertiary)',
    bg: 'var(--color-saul-overlay)',
    label: 'Skipped',
  },
}

const PROVIDER_COLORS: Record<string, string> = {
  apollo: 'var(--color-saul-info)',
  saul_web: 'var(--color-saul-cyan)',
  clearbit: 'var(--color-saul-violet)',
  linkedin: '#0077B5', // LinkedIn brand color — kept literal
  hunter: 'var(--color-saul-orange)',
  openai: 'var(--color-saul-success)',
  perplexity: 'var(--color-saul-violet)',
  scraper: 'var(--color-saul-text-secondary)',
  manual: 'var(--color-saul-text-tertiary)',
}

const PROVIDER_LABELS: Record<string, string> = {
  apollo: 'Apollo',
  saul_web: 'Saul Web',
  clearbit: 'Clearbit',
  linkedin: 'LinkedIn',
  hunter: 'Hunter.io',
  openai: 'OpenAI',
  perplexity: 'Perplexity',
  scraper: 'Scraper',
  manual: 'Manual',
}

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  completed:  { bg: 'color-mix(in srgb, var(--color-saul-cyan) 10%, transparent)',    text: 'var(--color-saul-cyan)' },
  failed:     { bg: 'color-mix(in srgb, var(--color-saul-danger) 10%, transparent)',  text: 'var(--color-saul-danger)' },
  pending:    { bg: 'color-mix(in srgb, var(--color-saul-warning) 10%, transparent)', text: 'var(--color-saul-warning)' },
  processing: { bg: 'color-mix(in srgb, var(--color-saul-info) 10%, transparent)',    text: 'var(--color-saul-info)' },
  skipped:    { bg: 'var(--color-saul-overlay)',                                       text: 'var(--color-saul-text-secondary)' },
}

function StatusCard({
  status,
  count,
}: {
  status: string
  count: number
}) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.skipped

  return (
    <div
      className="flex flex-col gap-3 p-4 rounded-[8px]"
      style={{
        background: 'var(--color-saul-bg-700)',
        border: '1px solid var(--color-saul-border)',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="relative flex h-2 w-2 shrink-0"
        >
          {cfg.pulse && (
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ background: cfg.dot }}
            />
          )}
          <span
            className="relative inline-flex rounded-full h-2 w-2"
            style={{ background: cfg.dot }}
          />
        </span>
        <span
          className="text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: 'var(--color-saul-text-secondary)' }}
        >
          {cfg.label}
        </span>
      </div>
      <span
        className="text-[28px] font-semibold leading-none tabular-nums"
        style={{ color: 'var(--color-saul-text-primary)', fontFamily: 'var(--font-mono)' }}
      >
        {count.toLocaleString()}
      </span>
    </div>
  )
}

function CoverageCard({ pct }: { pct: number }) {
  return (
    <div
      className="flex flex-col gap-3 p-5 rounded-[8px]"
      style={{
        background: 'var(--color-saul-bg-700)',
        border: '1px solid var(--color-saul-border)',
      }}
    >
      <span
        className="text-[11px] font-medium uppercase tracking-[0.06em]"
        style={{ color: 'var(--color-saul-text-secondary)' }}
      >
        Enrichment Coverage
      </span>
      <div className="flex items-end gap-1.5">
        <span
          className="text-[32px] font-semibold leading-none tabular-nums"
          style={{ color: 'var(--color-saul-cyan)', fontFamily: 'var(--font-mono)' }}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
      <div>
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ background: 'var(--color-saul-overlay)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(100, pct)}%`,
              background: 'linear-gradient(90deg, var(--color-saul-cyan-600), var(--color-saul-cyan))',
            }}
          />
        </div>
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-saul-text-secondary)' }}>
          of leads have at least one completed enrichment
        </p>
      </div>
    </div>
  )
}

function ProviderBadge({ provider }: { provider: string }) {
  const color = PROVIDER_COLORS[provider] ?? 'var(--color-saul-text-secondary)'
  const label = PROVIDER_LABELS[provider] ?? provider

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold"
      style={{
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
      }}
    >
      {label}
    </span>
  )
}

function ProviderTable({ data }: { data: EnrichmentData['by_provider'] }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--color-saul-bg-700)',
        border: '1px solid var(--color-saul-border)',
      }}
    >
      <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--color-saul-border)' }}>
        <h3
          className="text-sm font-semibold"
          style={{ color: 'var(--color-saul-text-primary)', fontFamily: 'var(--font-sans)' }}
        >
          Provider Breakdown
        </h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-saul-text-secondary)' }}>
          Enrichment runs, success rates, and spend per data provider
        </p>
      </div>

      {data.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm" style={{ color: 'var(--color-saul-text-secondary)' }}>
            No enrichment runs recorded yet.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-saul-border)' }}>
                {[
                  'Provider',
                  'Total Runs',
                  'Success',
                  'Failed',
                  'Success Rate',
                  'Avg Cost',
                  'Total Spend',
                ].map((h) => (
                  <th
                    key={h}
                    className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.07em]"
                    style={{ color: 'var(--color-saul-text-secondary)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr
                  key={row.provider}
                  style={{
                    borderBottom:
                      i < data.length - 1 ? '1px solid var(--color-saul-border-soft)' : undefined,
                  }}
                  className="transition-colors duration-100 hover:bg-[var(--color-saul-overlay-soft)]"
                >
                  <td className="px-6 py-3">
                    <ProviderBadge provider={row.provider} />
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className="text-sm tabular-nums"
                      style={{
                        color: 'var(--color-saul-text-primary)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {row.count.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className="text-sm tabular-nums"
                      style={{ color: 'var(--color-saul-cyan)', fontFamily: 'var(--font-mono)' }}
                    >
                      {row.completed.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className="text-sm tabular-nums"
                      style={{
                        color:
                          row.failed > 0
                            ? 'var(--color-saul-danger)'
                            : 'var(--color-saul-text-secondary)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {row.failed.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{ width: 48, background: 'var(--color-saul-overlay)' }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${row.success_rate}%`,
                            background:
                              row.success_rate >= 80
                                ? 'var(--color-saul-cyan)'
                                : row.success_rate >= 50
                                ? 'var(--color-saul-warning)'
                                : 'var(--color-saul-danger)',
                          }}
                        />
                      </div>
                      <span
                        className="text-xs tabular-nums"
                        style={{
                          color: 'var(--color-saul-text-primary)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {formatPercent(row.success_rate)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className="text-sm tabular-nums"
                      style={{
                        color: 'var(--color-saul-text-secondary)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {row.avg_cost_cents > 0 ? formatCurrency(row.avg_cost_cents) : '—'}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className="text-sm font-medium tabular-nums"
                      style={{
                        color: 'var(--color-saul-text-primary)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {formatCurrency(row.total_cost_cents)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RecentQueue({ items }: { items: EnrichmentData['recent'] }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--color-saul-bg-700)',
        border: '1px solid var(--color-saul-border)',
      }}
    >
      <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--color-saul-border)' }}>
        <h3
          className="text-sm font-semibold"
          style={{ color: 'var(--color-saul-text-primary)', fontFamily: 'var(--font-sans)' }}
        >
          Enrichment Queue
        </h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-saul-text-secondary)' }}>
          10 most recent enrichment jobs
        </p>
      </div>

      {items.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm" style={{ color: 'var(--color-saul-text-secondary)' }}>
            No enrichment jobs found.
          </p>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: 'var(--color-saul-border-soft)' }}>
          {items.map((item, i) => {
            const isFailed = item.status === 'failed'
            const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.skipped

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.04, ease: 'easeOut' }}
                className="flex items-center gap-4 px-6 py-4 transition-colors duration-100 hover:bg-[var(--color-saul-overlay-soft)]"
                style={
                  isFailed
                    ? {
                        borderLeft: '2px solid var(--color-saul-danger)',
                        paddingLeft: '22px',
                      }
                    : { borderLeft: '2px solid transparent' }
                }
              >
                <ProviderBadge provider={item.provider} />

                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: 'var(--color-saul-text-primary)' }}
                  >
                    {item.company_name}
                  </p>
                </div>

                <span
                  className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold shrink-0"
                  style={{ background: badge.bg, color: badge.text }}
                >
                  {item.status}
                </span>

                <span
                  className="text-xs tabular-nums shrink-0"
                  style={{
                    color:
                      item.cost_cents > 0
                        ? 'var(--color-saul-text-primary)'
                        : 'var(--color-saul-text-secondary)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {item.cost_cents > 0 ? formatCurrency(item.cost_cents) : '—'}
                </span>

                <span
                  className="text-xs shrink-0"
                  style={{ color: 'var(--color-saul-text-secondary)' }}
                >
                  {formatRelative(item.created_at)}
                </span>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RecommendationCallout() {
  const [state, setState] = useState<'idle' | 'loading' | 'success'>('idle')

  function handleQueue() {
    if (state !== 'idle') return
    setState('loading')
    setTimeout(() => setState('success'), 1800)
  }

  return (
    <div
      className="rounded-xl p-6 flex flex-col gap-4"
      style={{
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--color-saul-cyan) 6%, transparent) 0%, color-mix(in srgb, var(--color-saul-info) 4%, transparent) 100%)',
        border: '1px solid color-mix(in srgb, var(--color-saul-cyan) 18%, transparent)',
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded"
              style={{ background: 'color-mix(in srgb, var(--color-saul-cyan) 12%, transparent)', color: 'var(--color-saul-cyan)' }}
            >
              Recommendation
            </span>
          </div>
          <h3
            className="text-sm font-semibold mt-1"
            style={{ color: 'var(--color-saul-text-primary)', fontFamily: 'var(--font-sans)' }}
          >
            Next Enrichment Opportunity
          </h3>
          <p
            className="text-sm leading-relaxed max-w-xl"
            style={{ color: 'var(--color-saul-text-secondary)' }}
          >
            <span
              className="font-semibold tabular-nums"
              style={{ color: 'var(--color-saul-text-primary)' }}
            >
              15 high-score leads (70+)
            </span>{' '}
            are missing LinkedIn data. Running Proxycurl on these leads is estimated to cost{' '}
            <span
              className="font-semibold"
              style={{ color: 'var(--color-saul-cyan)', fontFamily: 'var(--font-mono)' }}
            >
              $2.25
            </span>{' '}
            and could increase their avg score by{' '}
            <span
              className="font-semibold"
              style={{ color: 'var(--color-saul-warning)' }}
            >
              8–12 points
            </span>
            .
          </p>
        </div>

        <button
          onClick={handleQueue}
          disabled={state !== 'idle'}
          className="shrink-0 px-4 py-2 rounded-[6px] text-sm font-semibold transition-all duration-200 cursor-pointer disabled:cursor-default"
          style={{
            background:
              state === 'success'
                ? 'color-mix(in srgb, var(--color-saul-cyan) 15%, transparent)'
                : state === 'loading'
                ? 'var(--color-saul-overlay)'
                : 'color-mix(in srgb, var(--color-saul-cyan) 12%, transparent)',
            color:
              state === 'success'
                ? 'var(--color-saul-cyan)'
                : state === 'loading'
                ? 'var(--color-saul-text-secondary)'
                : 'var(--color-saul-cyan)',
            border:
              state === 'success'
                ? '1px solid color-mix(in srgb, var(--color-saul-cyan) 30%, transparent)'
                : '1px solid color-mix(in srgb, var(--color-saul-cyan) 22%, transparent)',
          }}
        >
          {state === 'idle' && 'Queue Enrichment'}
          {state === 'loading' && (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-3.5 w-3.5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Queuing…
            </span>
          )}
          {state === 'success' && '✓ Queued Successfully'}
        </button>
      </div>

      <div
        className="grid grid-cols-3 gap-4 pt-4 border-t"
        style={{ borderColor: 'var(--color-saul-border)' }}
      >
        {[
          { label: 'Leads Targeted', value: '15', color: 'var(--color-saul-text-primary)' },
          { label: 'Estimated Cost', value: '$2.25', color: 'var(--color-saul-cyan)' },
          { label: 'Expected Score Gain', value: '+8–12 pts', color: 'var(--color-saul-warning)' },
        ].map((stat) => (
          <div key={stat.label} className="flex flex-col gap-0.5">
            <span
              className="text-[10px] uppercase tracking-[0.06em]"
              style={{ color: 'var(--color-saul-text-secondary)' }}
            >
              {stat.label}
            </span>
            <span
              className="text-lg font-semibold"
              style={{ color: stat.color, fontFamily: 'var(--font-mono)' }}
            >
              {stat.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function EnrichmentPageClient({ data }: EnrichmentPageClientProps) {
  const totalEnrichments = Object.values(data.status_counts).reduce((a, b) => a + b, 0)

  return (
    <div className="flex flex-col gap-8 px-6 py-8 max-w-[1400px] mx-auto">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <h1
          className="text-[22px] font-semibold tracking-tight"
          style={{ color: 'var(--color-saul-text-primary)', fontFamily: 'var(--font-sans)' }}
        >
          Data Enrichment
        </h1>
        <p className="text-sm" style={{ color: 'var(--color-saul-text-secondary)' }}>
          Enrichment queue, provider performance, and coverage across{' '}
          <span
            className="font-semibold tabular-nums"
            style={{ color: 'var(--color-saul-cyan)', fontFamily: 'var(--font-mono)' }}
          >
            {totalEnrichments.toLocaleString()}
          </span>{' '}
          total enrichment runs
        </p>
      </div>

      {/* Status Overview Row */}
      <div className="grid grid-cols-5 gap-3">
        {(['pending', 'processing', 'completed', 'failed', 'skipped'] as const).map((status) => (
          <StatusCard key={status} status={status} count={data.status_counts[status]} />
        ))}
      </div>

      {/* Coverage + Cost */}
      <div className="grid grid-cols-2 gap-4">
        <CoverageCard pct={data.enrichment_coverage_pct} />
        <div
          className="flex flex-col gap-3 p-5 rounded-[8px]"
          style={{
            background: 'var(--color-saul-bg-700)',
            border: '1px solid var(--color-saul-border)',
          }}
        >
          <span
            className="text-[11px] font-medium uppercase tracking-[0.06em]"
            style={{ color: 'var(--color-saul-text-secondary)' }}
          >
            Total Enrichment Spend
          </span>
          <div className="flex items-end gap-1.5">
            <span
              className="text-[32px] font-semibold leading-none tabular-nums"
              style={{ color: 'var(--color-saul-text-primary)', fontFamily: 'var(--font-mono)' }}
            >
              {formatCurrency(data.total_cost_cents)}
            </span>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--color-saul-text-secondary)' }}>
            across {data.by_provider.length} active provider{data.by_provider.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Provider Breakdown Table */}
      <ProviderTable data={data.by_provider} />

      {/* Recent Activity */}
      <RecentQueue items={data.recent} />

      {/* Recommendation Callout */}
      <RecommendationCallout />
    </div>
  )
}
