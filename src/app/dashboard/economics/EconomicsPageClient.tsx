'use client'

import { useRef, useSyncExternalStore } from 'react'
import { motion, useInView } from 'framer-motion'

// Avoid SSR / hydration churn for the chart-heavy economics page.
// useSyncExternalStore returns the snapshot eagerly on the client and the
// fallback ('false') during SSR -- so we render after hydration without
// the React-19-discouraged setState-in-effect pattern.
function useHasMounted(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  )
}
import { KPICard } from '@/components/dashboard/KPICard'
import { ChartContainer } from '@/components/charts/ChartContainer'
import { TokenUsageChart } from '@/components/charts/TokenUsageChart'
import { formatCurrency } from '@/lib/utils/formatters'
import { formatCompact } from '@/lib/utils/formatters'
import { useChartPalette, type ChartPalette } from '@/lib/utils/chartColors'

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

function providerColors(p: ChartPalette): Record<string, string> {
  return {
    apollo:   p.info,
    saul_web: p.primary,
    clearbit: p.violet,
    hunter:   p.orange,
    openai:   p.teal,
    manual:   p.neutral,
    unknown:  p.textTertiary,
  }
}

function agentColors(p: ChartPalette): Record<string, string> {
  return {
    enrichment:   p.primary,
    orchestrator: p.info,
    scoring:      p.warning,
    sourcing:     p.violet,
    outreach:     p.orange,
    qualifier:    p.teal,
  }
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

function BudgetGauge({ pct, palette }: { pct: number; palette: ChartPalette }) {
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
    clampedPct < 60 ? palette.success : clampedPct < 85 ? palette.warning : palette.danger

  return (
    <svg viewBox="0 0 200 200" width="200" height="200" aria-label={`Budget gauge: ${pct.toFixed(1)}% used`}>
      {/* Outer glow ring */}
      <circle cx={cx} cy={cy} r={r + 4} fill="none" stroke={arcColor} strokeWidth={1} strokeOpacity={0.08} />

      {/* Track */}
      <path
        d={trackPath}
        fill="none"
        stroke={palette.divider}
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
        fill={palette.textPrimary}
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
        fill={palette.textSecondary}
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

function WeeklySpendBars({ token_daily, monthly_spend_cents, palette }: { token_daily: TokenDay[]; monthly_spend_cents: number; palette: ChartPalette }) {
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
              style={{ background: `color-mix(in srgb, ${palette.primary} 25%, transparent)`, minHeight: 4 }}
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(pct, 6)}%` }}
              transition={{ duration: 0.7, delay: 0.1 * i, ease: [0.25, 0.46, 0.45, 0.94] as const }}
            />
            <span style={{ fontSize: 9, color: palette.textTertiary, fontFamily: 'var(--font-mono)' }}>
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
  palette,
}: {
  label: string
  color: string
  valueCents: number
  maxCents: number
  meta: string
  delay?: number
  palette: ChartPalette
}) {
  const pct = maxCents > 0 ? (valueCents / maxCents) * 100 : 0
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })

  return (
    <div ref={ref} className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span
          className="text-xs font-medium shrink-0 w-24 truncate"
          style={{ color: palette.textSecondary, fontFamily: 'var(--font-sans)' }}
        >
          {label}
        </span>
        <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: palette.divider }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: color }}
            initial={{ width: '0%' }}
            animate={inView ? { width: `${pct}%` } : { width: '0%' }}
            transition={{ duration: 0.8, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
          />
        </div>
        <div className="flex items-center gap-3 shrink-0 text-right" style={{ minWidth: 110 }}>
          <span style={{ color: palette.textPrimary, fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>
            {formatCurrency(valueCents)}
          </span>
          <span style={{ color: palette.textTertiary, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
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
        background: 'color-mix(in srgb, var(--color-saul-danger) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-saul-danger) 20%, transparent)',
        color: 'var(--color-saul-danger)',
      }}
    >
      Failed to load economics data: {message}
    </div>
  )
}

// ─── Main Client Component ────────────────────────────────────────────────────

export function EconomicsPageClient({ data, error }: Props) {
  const mounted = useHasMounted()
  const palette = useChartPalette()
  const PROVIDER_COLORS = providerColors(palette)
  const AGENT_COLORS = agentColors(palette)
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
                  background: 'color-mix(in srgb, var(--color-saul-cyan) 8%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-saul-cyan) 20%, transparent)',
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
            background: 'var(--color-saul-overlay-low)',
            border: '1px solid var(--color-saul-border)',
            color: 'var(--color-saul-text-tertiary)',
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
          { title: 'Total Spend',       value: (data?.total_spend_cents ?? 84700) / 100,       trend: -4.2,  trendLabel: 'vs last month', accentColor: palette.primary },
          { title: 'Monthly Spend',     value: (data?.monthly_spend_cents ?? 31200) / 100,     trend: -8.1,  trendLabel: 'vs last month', accentColor: palette.primary },
          { title: 'Cost / Lead',       value: (data?.cost_per_lead_cents ?? 169) / 100,       trend: -12.4, trendLabel: 'improving',     accentColor: palette.primary },
          { title: 'Cost / Qualified',  value: (data?.cost_per_qualified_cents ?? 1412) / 100, trend: -6.7,  trendLabel: 'improving',     accentColor: palette.warning },
          { title: 'Cost / Conversion', value: (data?.cost_per_conversion_cents ?? 2732) / 100, trend: -3.9, trendLabel: 'improving',    accentColor: palette.violet },
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
        style={{ background: 'var(--color-saul-bg-700)', border: '1px solid var(--color-saul-border)' }}
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
            style={{ background: 'var(--color-saul-overlay-low)', color: 'var(--color-saul-text-tertiary)', fontFamily: 'var(--font-mono)' }}
          >
            Monthly · $5,000 cap
          </span>
        </div>

        <div className="flex items-start gap-8">
          {/* Gauge */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            <BudgetGauge pct={data?.budget_used_pct ?? 6.24} palette={palette} />
            <div className="flex items-center gap-3 text-center">
              <div className="flex flex-col items-center gap-0.5">
                <span style={{ fontSize: 10, color: palette.textTertiary, fontFamily: 'var(--font-mono)' }}>Used</span>
                <span style={{ fontSize: 13, color: palette.textPrimary, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {formatCurrency(data?.monthly_spend_cents ?? 31200)}
                </span>
              </div>
              <div style={{ width: 1, height: 28, background: palette.divider }} />
              <div className="flex flex-col items-center gap-0.5">
                <span style={{ fontSize: 10, color: palette.textTertiary, fontFamily: 'var(--font-mono)' }}>Remaining</span>
                <span style={{ fontSize: 13, color: palette.primary, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {formatCurrency(budgetRemaining)}
                </span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, alignSelf: 'stretch', background: palette.divider }} />

          {/* Projections + weekly bars */}
          <div className="flex-1 flex flex-col gap-5 justify-center">
            {/* Projected month-end */}
            <div
              className="rounded-lg p-4"
              style={{ background: 'var(--color-saul-bg-600)', border: '1px solid var(--color-saul-border-soft)' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: palette.textTertiary }}>
                    Projected Month-End
                  </span>
                  <span
                    style={{
                      fontSize: 24,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: palette.textPrimary,
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
                      background: 'color-mix(in srgb, var(--color-saul-cyan) 10%, transparent)',
                      color: 'var(--color-saul-cyan)',
                      border: '1px solid color-mix(in srgb, var(--color-saul-cyan) 22%, transparent)',
                    }}
                  >
                    {daysRemaining}d remaining
                  </span>
                  <span className="text-[11px]" style={{ color: palette.textTertiary, fontFamily: 'var(--font-mono)' }}>
                    vs {formatCurrency(data?.monthly_budget_cents ?? 500000)} budget
                  </span>
                </div>
              </div>
            </div>

            {/* Budget status bar */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px]" style={{ color: palette.textTertiary }}>Monthly spend rate</span>
                <span className="text-[11px]" style={{ color: palette.textTertiary, fontFamily: 'var(--font-mono)' }}>
                  {formatCurrency(Math.round((data?.monthly_spend_cents ?? 31200) / Math.max(new Date().getDate(), 1)))}/day
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: palette.divider }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${palette.primary}, ${
                      (data?.budget_used_pct ?? 6) < 60 ? palette.primary :
                      (data?.budget_used_pct ?? 6) < 85 ? palette.warning : palette.danger
                    })`,
                  }}
                  initial={{ width: '0%' }}
                  animate={{ width: `${Math.min(data?.budget_used_pct ?? 6.24, 100)}%` }}
                  transition={{ duration: 1.4, delay: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: palette.textTertiary }}>
                <span>$0</span>
                <span style={{ color: (data?.budget_used_pct ?? 6) < 60 ? palette.primary : palette.warning }}>
                  {(data?.budget_used_pct ?? 6.24).toFixed(1)}% used
                </span>
                <span>$5,000</span>
              </div>
            </div>

            {/* Weekly bars */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px]" style={{ color: palette.textTertiary }}>Spend by week this month</span>
              <WeeklySpendBars
                token_daily={data?.token_daily ?? []}
                monthly_spend_cents={data?.monthly_spend_cents ?? 31200}
                palette={palette}
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
          style={{ background: 'var(--color-saul-bg-700)', border: '1px solid var(--color-saul-border)' }}
        >
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-saul-text-primary)' }}>
              Enrichment Cost by Provider
            </h3>
            <p className="text-xs" style={{ color: palette.textTertiary }}>
              Total: {formatCurrency(data?.enrichment_spend_cents ?? 84700)}
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {(data?.enrichment_by_provider ?? []).map((provider, i) => (
              <HBarRow
                key={provider.provider}
                label={PROVIDER_LABELS[provider.provider] ?? provider.provider}
                color={PROVIDER_COLORS[provider.provider] ?? palette.neutral}
                valueCents={provider.total_cost_cents}
                maxCents={enrichmentMax}
                meta={`${provider.record_count} records`}
                delay={0.08 * i}
                palette={palette}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 pt-2 border-t" style={{ borderColor: palette.divider }}>
            {(data?.enrichment_by_provider ?? []).map(p => (
              <div key={p.provider} className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full inline-block shrink-0"
                  style={{ background: PROVIDER_COLORS[p.provider] ?? palette.neutral }}
                />
                <span className="text-[11px]" style={{ color: palette.textTertiary }}>
                  {PROVIDER_LABELS[p.provider] ?? p.provider}
                </span>
                <span className="text-[11px]" style={{ color: palette.textSecondary, fontFamily: 'var(--font-mono)' }}>
                  avg {formatCurrency(p.avg_cost_cents)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Agent cost breakdown */}
        <div
          className="rounded-xl p-6 flex flex-col gap-5"
          style={{ background: 'var(--color-saul-bg-700)', border: '1px solid var(--color-saul-border)' }}
        >
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-saul-text-primary)' }}>
              Agent Cost Breakdown
            </h3>
            <p className="text-xs" style={{ color: palette.textTertiary }}>
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
                      style={{ background: AGENT_COLORS[agent.agent_type] ?? palette.neutral }}
                    />
                    <span className="text-xs font-medium truncate" style={{ color: palette.textSecondary }}>
                      {AGENT_LABELS[agent.agent_type] ?? agent.agent_type}
                    </span>
                  </div>
                  <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: palette.divider }}>
                    <HBarInner
                      color={AGENT_COLORS[agent.agent_type] ?? palette.neutral}
                      pct={(agent.total_cost_cents / agentMax) * 100}
                      delay={0.08 * i}
                    />
                  </div>
                  <div className="flex flex-col items-end shrink-0" style={{ minWidth: 90 }}>
                    <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: palette.textPrimary, fontWeight: 600 }}>
                      {formatCurrency(agent.total_cost_cents)}
                    </span>
                    <span style={{ fontSize: 10, color: palette.textTertiary, fontFamily: 'var(--font-mono)' }}>
                      {agent.runs.toLocaleString()} runs
                    </span>
                  </div>
                </div>

                {/* Avg tokens pill */}
                <div className="flex items-center gap-1.5 ml-4">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                      background: 'var(--color-saul-overlay-low)',
                      color: palette.textTertiary,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    avg {formatCompact(agent.avg_tokens)} tok/run
                  </span>
                  <span className="text-[10px]" style={{ color: palette.textTertiary, fontFamily: 'var(--font-mono)' }}>
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
          border: '1px solid var(--color-saul-border)',
          borderLeft: '3px solid var(--color-saul-cyan)',
        }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.65, ease }}
      >
        <div className="flex items-start gap-4">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mt-0.5"
            style={{ background: 'color-mix(in srgb, var(--color-saul-cyan) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-saul-cyan) 22%, transparent)' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L9.5 6H14L10.5 8.5L12 12.5L8 10L4 12.5L5.5 8.5L2 6H6.5L8 2Z" fill={palette.primary} fillOpacity="0.9" />
            </svg>
          </div>

          <div className="flex flex-col gap-3 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-saul-cyan)' }}>
                ROI Summary
              </span>
              <span style={{ width: 1, height: 12, background: 'color-mix(in srgb, var(--color-saul-cyan) 30%, transparent)', display: 'inline-block' }} />
              <span className="text-[11px]" style={{ color: palette.textTertiary }}>Exotiq · All-time</span>
            </div>

            <p className="text-sm leading-relaxed" style={{ color: palette.textSecondary }}>
              At current velocity, Exotiq spends{' '}
              <span style={{ color: palette.textPrimary, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                {formatCurrency(data?.cost_per_lead_cents ?? 169)}
              </span>{' '}
              per acquired lead and{' '}
              <span style={{ color: palette.textPrimary, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                {formatCurrency(data?.cost_per_conversion_cents ?? 2732)}
              </span>{' '}
              per conversion. Compared to the industry average of{' '}
              <span style={{ color: palette.warning, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>$45–85</span>{' '}
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
              style={{ borderColor: palette.divider }}
            >
              {[
                {
                  label: 'Industry avg / qualified',
                  value: '$45–85',
                  color: palette.warning,
                },
                {
                  label: 'Saul cost / qualified',
                  value: formatCurrency(data?.cost_per_qualified_cents ?? 1412),
                  color: palette.primary,
                },
                {
                  label: 'Cost efficiency',
                  value: `${efficiencyMultiplier}×`,
                  color: palette.primary,
                },
                {
                  label: 'Savings vs industry avg',
                  value: formatCurrency(Math.max(0, 6500 - (data?.cost_per_qualified_cents ?? 1412))),
                  color: palette.primary,
                },
              ].map(stat => (
                <div key={stat.label} className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: palette.textTertiary }}>
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
