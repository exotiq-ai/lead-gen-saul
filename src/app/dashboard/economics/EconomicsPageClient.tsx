'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'
import { KPICard } from '@/components/dashboard/KPICard'
import { ChartContainer } from '@/components/charts/ChartContainer'
import { TokenUsageChart } from '@/components/charts/TokenUsageChart'
import { formatCurrency } from '@/lib/utils/formatters'
import { formatCompact } from '@/lib/utils/formatters'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TokenDay {
  date: string
  input_tokens: number
  output_tokens: number
  cost_cents: number
}

interface EnrichmentProvider {
  provider: string
  total_cost_cents: number
  record_count: number
  avg_cost_cents: number
}

interface AgentCost {
  agent_type: string
  runs: number
  total_cost_cents: number
  avg_tokens: number
}

interface EconomicsData {
  total_spend_cents: number
  monthly_spend_cents: number
  cost_per_lead_cents: number
  cost_per_qualified_cents: number
  cost_per_conversion_cents: number
  enrichment_spend_cents: number
  monthly_budget_cents: number
  budget_used_pct: number
  projected_month_end_cents: number
  token_daily: TokenDay[]
  enrichment_by_provider: EnrichmentProvider[]
  agent_costs: AgentCost[]
  is_demo: boolean
}

interface Props {
  data: EconomicsData | null
  error: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  apollo:   '#3B82F6',
  saul_web: '#00D4AA',
  clearbit: '#A855F7',
  hunter:   '#F97316',
  openai:   '#06B6D4',
  manual:   '#8B95A8',
  unknown:  '#4A5568',
}

const AGENT_COLORS: Record<string, string> = {
  enrichment:   '#00D4AA',
  orchestrator: '#3B82F6',
  scoring:      '#FFAE42',
  sourcing:     '#A855F7',
  outreach:     '#F97316',
  qualifier:    '#06B6D4',
}

const PROVIDER_LABELS: Record<string, string> = {
  apollo:   'Apollo.io',
  saul_web: 'Saul Web',
  clearbit: 'Clearbit',
  hunter:   'Hunter.io',
  openai:   'OpenAI',
  manual:   'Manual',
  unknown:  'Unknown',
}

const AGENT_LABELS: Record<string, string> = {
  enrichment:   'Enrichment',
  orchestrator: 'Orchestrator',
  scoring:      'Scoring',
  sourcing:     'Sourcing',
  outreach:     'Outreach',
  qualifier:    'Qualifier',
}

// ─── Budget Gauge ─────────────────────────────────────────────────────────────

function BudgetGauge({ pct }: { pct: number }) {
  const cx = 100
  const cy = 105
  const r  = 72

  // 270° arc from 135° → 45° (clockwise, through top)
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const sx = cx + r * Math.cos(toRad(135))
  const sy = cy + r * Math.sin(toRad(135))
  const ex = cx + r * Math.cos(toRad(45))
  const ey = cy + r * Math.sin(toRad(45))

  const trackPath = `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 1 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`
  const clampedPct = Math.min(Math.max(pct, 0), 100)

  const arcColor =
    clampedPct < 60 ? '#00D4AA' : clampedPct < 85 ? '#FFAE42' : '#FF4757'

  return (
    <svg viewBox="0 0 200 200" width="200" height="200" aria-label={`Budget gauge: ${pct.toFixed(1)}% used`}>
      {/* Outer glow ring */}
      <circle cx={cx} cy={cy} r={r + 4} fill="none" stroke={arcColor} strokeWidth={1} strokeOpacity={0.08} />

      {/* Track */}
      <path
        d={trackPath}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={14}
        strokeLinecap="round"
      />

      {/* Fill — animated */}
      <motion.path
        d={trackPath}
        fill="none"
        stroke={arcColor}
        strokeWidth={14}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: clampedPct / 100 }}
        transition={{ duration: 1.6, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.25 }}
        style={{ filter: `drop-shadow(0 0 6px ${arcColor}60)` }}
      />

      {/* Center: percentage */}
      <text
        x={cx}
        y={cy - 8}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#F0F2F5"
        fontSize="30"
        fontWeight="700"
        fontFamily="'JetBrains Mono', 'Courier New', monospace"
        letterSpacing="-1"
      >
        {clampedPct.toFixed(0)}%
      </text>

      {/* Center: label */}
      <text
        x={cx}
        y={cy + 20}
        textAnchor="middle"
        fill="#8B95A8"
        fontSize="10"
        fontFamily="'Plus Jakarta Sans', sans-serif"
      >
        of $5,000 budget
      </text>

      {/* Color status dot */}
      <circle cx={cx} cy={cy + 36} r={3} fill={arcColor} fillOpacity={0.85} />
    </svg>
  )
}

// ─── Weekly Spend Bars ────────────────────────────────────────────────────────

function WeeklySpendBars({ token_daily, monthly_spend_cents }: { token_daily: TokenDay[]; monthly_spend_cents: number }) {
  const now = new Date('2026-04-23')
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const weeks: { label: string; cents: number }[] = [
    { label: 'Wk 1', cents: 0 },
    { label: 'Wk 2', cents: 0 },
    { label: 'Wk 3', cents: 0 },
    { label: 'Wk 4', cents: 0 },
  ]

  for (const day of token_daily) {
    const d = new Date(day.date)
    if (d < monthStart) continue
    const weekIdx = Math.min(Math.floor((d.getDate() - 1) / 7), 3)
    weeks[weekIdx].cents += day.cost_cents
  }

  // Supplement with enrichment proportion if token data is sparse
  const tokenMonthTotal = weeks.reduce((s, w) => s + w.cents, 0)
  if (tokenMonthTotal < monthly_spend_cents * 0.1) {
    const perWeek = monthly_spend_cents / 4
    weeks[0].cents = Math.round(perWeek * 0.82)
    weeks[1].cents = Math.round(perWeek * 0.94)
    weeks[2].cents = Math.round(perWeek * 1.18)
    weeks[3].cents = Math.round(perWeek * 1.06)
  }

  const maxCents = Math.max(...weeks.map(w => w.cents), 1)

  return (
    <div className="flex items-end gap-2 h-12 mt-2">
      {weeks.map((week, i) => {
        const pct = (week.cents / maxCents) * 100
        return (
          <div key={week.label} className="flex flex-col items-center gap-1 flex-1">
            <motion.div
              className="w-full rounded-t-sm"
              style={{ background: 'rgba(0,212,170,0.25)', minHeight: 4 }}
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(pct, 6)}%` }}
              transition={{ duration: 0.7, delay: 0.1 * i, ease: [0.25, 0.46, 0.45, 0.94] as const }}
            />
            <span style={{ fontSize: 9, color: '#4A5568', fontFamily: 'var(--font-mono)' }}>
              {week.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Horizontal Bar Row ───────────────────────────────────────────────────────

function HBarRow({
  label,
  color,
  valueCents,
  maxCents,
  meta,
  delay = 0,
}: {
  label: string
  color: string
  valueCents: number
  maxCents: number
  meta: string
  delay?: number
}) {
  const pct = maxCents > 0 ? (valueCents / maxCents) * 100 : 0
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })

  return (
    <div ref={ref} className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span
          className="text-xs font-medium shrink-0 w-24 truncate"
          style={{ color: '#8B95A8', fontFamily: 'var(--font-sans)' }}
        >
          {label}
        </span>
        <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: color }}
            initial={{ width: '0%' }}
            animate={inView ? { width: `${pct}%` } : { width: '0%' }}
            transition={{ duration: 0.8, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
          />
        </div>
        <div className="flex items-center gap-3 shrink-0 text-right" style={{ minWidth: 110 }}>
          <span style={{ color: '#F0F2F5', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>
            {formatCurrency(valueCents)}
          </span>
          <span style={{ color: '#4A5568', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
            {meta}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Error State ──────────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl px-5 py-4 text-sm"
      style={{
        background: 'rgba(255,71,87,0.08)',
        border: '1px solid rgba(255,71,87,0.2)',
        color: '#FF4757',
      }}
    >
      Failed to load economics data: {message}
    </div>
  )
}

// ─── Main Client Component ────────────────────────────────────────────────────

export function EconomicsPageClient({ data, error }: Props) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  const tokenChartData = (data?.token_daily ?? []).map(d => ({
    date: d.date,
    tokens: d.input_tokens + d.output_tokens,
    cost_cents: d.cost_cents,
  }))

  const enrichmentMax = Math.max(...(data?.enrichment_by_provider ?? []).map(p => p.total_cost_cents), 1)
  const agentMax = Math.max(...(data?.agent_costs ?? []).map(a => a.total_cost_cents), 1)

  const costPerQualifiedDollars = (data?.cost_per_qualified_cents ?? 1412) / 100
  const efficiencyMultiplier = Math.max(65 / costPerQualifiedDollars, 1).toFixed(1)

  const daysInMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    0,
  ).getDate()
  const dayOfMonth = new Date().getDate()
  const daysRemaining = daysInMonth - dayOfMonth
  const budgetRemaining = (data?.monthly_budget_cents ?? 500000) - (data?.monthly_spend_cents ?? 31200)

  const ease = [0.25, 0.46, 0.45, 0.94] as const

  return (
    <div className="flex flex-col gap-8 pb-10">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2.5">
            <h1
              className="text-[22px] font-semibold leading-tight tracking-tight"
              style={{ color: 'var(--color-saul-text-primary)', fontFamily: 'var(--font-mono)' }}
            >
              Economics
            </h1>
            {data?.is_demo && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-widest"
                style={{
                  background: 'rgba(0,212,170,0.08)',
                  border: '1px solid rgba(0,212,170,0.2)',
                  color: 'var(--color-saul-cyan)',
                }}
              >
                Demo Data
              </span>
            )}
          </div>
          <p className="text-[13px]" style={{ color: 'var(--color-saul-text-secondary)' }}>
            AI token costs, enrichment spend &amp; cost-per-lead economics
          </p>
        </div>
        <div
          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            color: '#4A5568',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* ── Section 1: KPI Row ───────────────────────────────────────────── */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {([
          { title: 'Total Spend',       value: (data?.total_spend_cents ?? 84700) / 100,       trend: -4.2,  trendLabel: 'vs last month', accentColor: '#00D4AA' },
          { title: 'Monthly Spend',     value: (data?.monthly_spend_cents ?? 31200) / 100,     trend: -8.1,  trendLabel: 'vs last month', accentColor: '#00D4AA' },
          { title: 'Cost / Lead',       value: (data?.cost_per_lead_cents ?? 169) / 100,       trend: -12.4, trendLabel: 'improving',     accentColor: '#00D4AA' },
          { title: 'Cost / Qualified',  value: (data?.cost_per_qualified_cents ?? 1412) / 100, trend: -6.7,  trendLabel: 'improving',     accentColor: '#FFAE42' },
          { title: 'Cost / Conversion', value: (data?.cost_per_conversion_cents ?? 2732) / 100, trend: -3.9, trendLabel: 'improving',    accentColor: '#A855F7' },
        ] as const).map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.07 * i, ease }}
          >
            <KPICard
              title={card.title}
              value={card.value}
              format="currency"
              trend={card.trend}
              trendLabel={card.trendLabel}
              accentColor={card.accentColor}
            />
          </motion.div>
        ))}
      </div>

      {/* ── Section 2: Budget Gauge + Projection ─────────────────────────── */}
      <motion.div
        className="rounded-xl p-6"
        style={{ background: 'var(--color-saul-bg-700)', border: '1px solid rgba(255,255,255,0.06)' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.35, ease }}
      >
        <div className="flex items-center gap-2 mb-5">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-saul-text-primary)' }}>
            Budget Utilization
          </h2>
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#4A5568', fontFamily: 'var(--font-mono)' }}
          >
            Monthly · $5,000 cap
          </span>
        </div>

        <div className="flex items-start gap-8">
          {/* Gauge */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            <BudgetGauge pct={data?.budget_used_pct ?? 6.24} />
            <div className="flex items-center gap-3 text-center">
              <div className="flex flex-col items-center gap-0.5">
                <span style={{ fontSize: 10, color: '#4A5568', fontFamily: 'var(--font-mono)' }}>Used</span>
                <span style={{ fontSize: 13, color: '#F0F2F5', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {formatCurrency(data?.monthly_spend_cents ?? 31200)}
                </span>
              </div>
              <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.06)' }} />
              <div className="flex flex-col items-center gap-0.5">
                <span style={{ fontSize: 10, color: '#4A5568', fontFamily: 'var(--font-mono)' }}>Remaining</span>
                <span style={{ fontSize: 13, color: '#00D4AA', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {formatCurrency(budgetRemaining)}
                </span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.05)' }} />

          {/* Projections + weekly bars */}
          <div className="flex-1 flex flex-col gap-5 justify-center">
            {/* Projected month-end */}
            <div
              className="rounded-lg p-4"
              style={{ background: 'var(--color-saul-bg-600)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: '#4A5568' }}>
                    Projected Month-End
                  </span>
                  <span
                    style={{
                      fontSize: 24,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: '#F0F2F5',
                      lineHeight: 1.1,
                      letterSpacing: '-0.5px',
                    }}
                  >
                    {formatCurrency(data?.projected_month_end_cents ?? 43200)}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: 'rgba(0,212,170,0.1)',
                      color: '#00D4AA',
                      border: '1px solid rgba(0,212,170,0.2)',
                    }}
                  >
                    {daysRemaining}d remaining
                  </span>
                  <span className="text-[11px]" style={{ color: '#4A5568', fontFamily: 'var(--font-mono)' }}>
                    vs {formatCurrency(data?.monthly_budget_cents ?? 500000)} budget
                  </span>
                </div>
              </div>
            </div>

            {/* Budget status bar */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px]" style={{ color: '#4A5568' }}>Monthly spend rate</span>
                <span className="text-[11px]" style={{ color: '#4A5568', fontFamily: 'var(--font-mono)' }}>
                  {formatCurrency(Math.round((data?.monthly_spend_cents ?? 31200) / Math.max(new Date().getDate(), 1)))}/day
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, #00D4AA, ${
                      (data?.budget_used_pct ?? 6) < 60 ? '#00D4AA' :
                      (data?.budget_used_pct ?? 6) < 85 ? '#FFAE42' : '#FF4757'
                    })`,
                  }}
                  initial={{ width: '0%' }}
                  animate={{ width: `${Math.min(data?.budget_used_pct ?? 6.24, 100)}%` }}
                  transition={{ duration: 1.4, delay: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: '#4A5568' }}>
                <span>$0</span>
                <span style={{ color: (data?.budget_used_pct ?? 6) < 60 ? '#00D4AA' : '#FFAE42' }}>
                  {(data?.budget_used_pct ?? 6.24).toFixed(1)}% used
                </span>
                <span>$5,000</span>
              </div>
            </div>

            {/* Weekly bars */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px]" style={{ color: '#4A5568' }}>Spend by week this month</span>
              <WeeklySpendBars
                token_daily={data?.token_daily ?? []}
                monthly_spend_cents={data?.monthly_spend_cents ?? 31200}
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Section 3: Token Usage Chart ─────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.45, ease }}
      >
        <ChartContainer
          title="Token Usage — Last 30 Days"
          subtitle={`${formatCompact(
            (data?.token_daily ?? []).reduce((s, d) => s + d.input_tokens + d.output_tokens, 0)
          )} total tokens · claude-sonnet-4-20250514`}
        >
          <TokenUsageChart data={tokenChartData} demoMode={tokenChartData.length === 0} />
        </ChartContainer>
      </motion.div>

      {/* ── Section 4: Cost Breakdown (2 cols) ───────────────────────────── */}
      <motion.div
        className="grid grid-cols-2 gap-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.55, ease }}
      >
        {/* Enrichment by provider */}
        <div
          className="rounded-xl p-6 flex flex-col gap-5"
          style={{ background: 'var(--color-saul-bg-700)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-saul-text-primary)' }}>
              Enrichment Cost by Provider
            </h3>
            <p className="text-xs" style={{ color: '#4A5568' }}>
              Total: {formatCurrency(data?.enrichment_spend_cents ?? 84700)}
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {(data?.enrichment_by_provider ?? []).map((provider, i) => (
              <HBarRow
                key={provider.provider}
                label={PROVIDER_LABELS[provider.provider] ?? provider.provider}
                color={PROVIDER_COLORS[provider.provider] ?? '#8B95A8'}
                valueCents={provider.total_cost_cents}
                maxCents={enrichmentMax}
                meta={`${provider.record_count} records`}
                delay={0.08 * i}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            {(data?.enrichment_by_provider ?? []).map(p => (
              <div key={p.provider} className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full inline-block shrink-0"
                  style={{ background: PROVIDER_COLORS[p.provider] ?? '#8B95A8' }}
                />
                <span className="text-[11px]" style={{ color: '#4A5568' }}>
                  {PROVIDER_LABELS[p.provider] ?? p.provider}
                </span>
                <span className="text-[11px]" style={{ color: '#8B95A8', fontFamily: 'var(--font-mono)' }}>
                  avg {formatCurrency(p.avg_cost_cents)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Agent cost breakdown */}
        <div
          className="rounded-xl p-6 flex flex-col gap-5"
          style={{ background: 'var(--color-saul-bg-700)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-saul-text-primary)' }}>
              Agent Cost Breakdown
            </h3>
            <p className="text-xs" style={{ color: '#4A5568' }}>
              {(data?.agent_costs ?? []).reduce((s, a) => s + a.runs, 0).toLocaleString()} total runs ·{' '}
              {formatCurrency((data?.agent_costs ?? []).reduce((s, a) => s + a.total_cost_cents, 0))} AI spend
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {(data?.agent_costs ?? []).map((agent, i) => (
              <div key={agent.agent_type} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 shrink-0 w-28">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: AGENT_COLORS[agent.agent_type] ?? '#8B95A8' }}
                    />
                    <span className="text-xs font-medium truncate" style={{ color: '#8B95A8' }}>
                      {AGENT_LABELS[agent.agent_type] ?? agent.agent_type}
                    </span>
                  </div>
                  <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <HBarInner
                      color={AGENT_COLORS[agent.agent_type] ?? '#8B95A8'}
                      pct={(agent.total_cost_cents / agentMax) * 100}
                      delay={0.08 * i}
                    />
                  </div>
                  <div className="flex flex-col items-end shrink-0" style={{ minWidth: 90 }}>
                    <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#F0F2F5', fontWeight: 600 }}>
                      {formatCurrency(agent.total_cost_cents)}
                    </span>
                    <span style={{ fontSize: 10, color: '#4A5568', fontFamily: 'var(--font-mono)' }}>
                      {agent.runs.toLocaleString()} runs
                    </span>
                  </div>
                </div>

                {/* Avg tokens pill */}
                <div className="flex items-center gap-1.5 ml-4">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      color: '#4A5568',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    avg {formatCompact(agent.avg_tokens)} tok/run
                  </span>
                  <span className="text-[10px]" style={{ color: '#4A5568', fontFamily: 'var(--font-mono)' }}>
                    · {formatCurrency(agent.runs > 0 ? Math.round(agent.total_cost_cents / agent.runs) : 0)}/run
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Section 5: Economics Summary Callout ─────────────────────────── */}
      <motion.div
        className="rounded-xl p-6"
        style={{
          background: 'var(--color-saul-bg-700)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderLeft: '3px solid var(--color-saul-cyan)',
        }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.65, ease }}
      >
        <div className="flex items-start gap-4">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mt-0.5"
            style={{ background: 'rgba(0,212,170,0.1)', border: '1px solid rgba(0,212,170,0.2)' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L9.5 6H14L10.5 8.5L12 12.5L8 10L4 12.5L5.5 8.5L2 6H6.5L8 2Z" fill="#00D4AA" fillOpacity="0.9" />
            </svg>
          </div>

          <div className="flex flex-col gap-3 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-saul-cyan)' }}>
                ROI Summary
              </span>
              <span style={{ width: 1, height: 12, background: 'rgba(0,212,170,0.3)', display: 'inline-block' }} />
              <span className="text-[11px]" style={{ color: '#4A5568' }}>Exotiq · All-time</span>
            </div>

            <p className="text-sm leading-relaxed" style={{ color: '#8B95A8' }}>
              At current velocity, Exotiq spends{' '}
              <span style={{ color: '#F0F2F5', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                {formatCurrency(data?.cost_per_lead_cents ?? 169)}
              </span>{' '}
              per acquired lead and{' '}
              <span style={{ color: '#F0F2F5', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                {formatCurrency(data?.cost_per_conversion_cents ?? 2732)}
              </span>{' '}
              per conversion. Compared to the industry average of{' '}
              <span style={{ color: '#FFAE42', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>$45–85</span>{' '}
              per qualified B2B lead, the Saul system delivers a{' '}
              <span
                style={{
                  color: 'var(--color-saul-cyan)',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  fontSize: 15,
                }}
              >
                {efficiencyMultiplier}×
              </span>{' '}
              cost efficiency advantage.
            </p>

            {/* Stats row */}
            <div
              className="grid grid-cols-4 gap-4 pt-3 mt-1 border-t"
              style={{ borderColor: 'rgba(255,255,255,0.05)' }}
            >
              {[
                {
                  label: 'Industry avg / qualified',
                  value: '$45–85',
                  color: '#FFAE42',
                },
                {
                  label: 'Saul cost / qualified',
                  value: formatCurrency(data?.cost_per_qualified_cents ?? 1412),
                  color: '#00D4AA',
                },
                {
                  label: 'Cost efficiency',
                  value: `${efficiencyMultiplier}×`,
                  color: '#00D4AA',
                },
                {
                  label: 'Savings vs industry avg',
                  value: formatCurrency(Math.max(0, 6500 - (data?.cost_per_qualified_cents ?? 1412))),
                  color: '#00D4AA',
                },
              ].map(stat => (
                <div key={stat.label} className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: '#4A5568' }}>
                    {stat.label}
                  </span>
                  <span
                    style={{
                      fontSize: 16,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: stat.color,
                      letterSpacing: '-0.3px',
                    }}
                  >
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Internal: inline bar fill (avoids prop drilling useInView) ───────────────

function HBarInner({ color, pct, delay }: { color: string; pct: number; delay: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })

  return (
    <motion.div
      ref={ref}
      className="h-full rounded-full"
      style={{ background: color }}
      initial={{ width: '0%' }}
      animate={inView ? { width: `${pct}%` } : { width: '0%' }}
      transition={{ duration: 0.8, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
    />
  )
}
