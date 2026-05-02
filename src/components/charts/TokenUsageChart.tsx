'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { formatCompact, formatNumber } from '@/lib/utils/formatters'
import { useChartPalette, type ChartPalette } from '@/lib/utils/chartColors'

interface TokenDataPoint {
  date: string
  tokens: number
  cost_cents: number
}

interface TokenUsageChartProps {
  data?: TokenDataPoint[]
  demoMode?: boolean
}

function generateDemoData(): TokenDataPoint[] {
  const now = new Date('2026-04-23')
  const points: TokenDataPoint[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const baseTokens = 12000 + Math.floor(Math.random() * 8000)
    const spikes: Record<string, number> = {
      '2026-04-10': 38000,
      '2026-04-11': 44000,
      '2026-04-18': 31000,
    }
    const key = d.toISOString().split('T')[0]
    const tokens = spikes[key] ?? baseTokens
    points.push({
      date: key,
      tokens,
      cost_cents: Math.round(tokens * 0.18), // ~$0.0018/1k tokens blended
    })
  }
  return points
}

function formatCostAxis(cents: number): string {
  const dollars = cents / 100
  if (dollars >= 10) return `$${dollars.toFixed(0)}`
  return `$${dollars.toFixed(2)}`
}

interface TokenTooltipProps {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number }>
  label?: string
  palette: ChartPalette
}

function CustomTooltip({ active, payload, label, palette }: TokenTooltipProps) {
  if (!active || !payload?.length) return null
  const date = new Date(label as string)
  const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const tokens = payload.find((p) => p.dataKey === 'tokens')?.value as number
  const cost = payload.find((p) => p.dataKey === 'cost_cents')?.value as number

  return (
    <div
      className="rounded-lg px-3 py-2.5 text-xs flex flex-col gap-1.5"
      style={{
        background: palette.tooltipBg,
        border: `1px solid ${palette.tooltipBorder}`,
        color: palette.tooltipText,
        minWidth: 148,
      }}
    >
      <p className="font-medium mb-0.5" style={{ color: palette.textSecondary }}>{dateLabel}</p>
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: palette.primary, display: 'inline-block' }} />
          <span style={{ color: palette.textSecondary }}>Tokens</span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', color: palette.primary }}>{formatNumber(tokens ?? 0)}</span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: palette.violet, display: 'inline-block' }} />
          <span style={{ color: palette.textSecondary }}>Cost</span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', color: palette.violet }}>
          ${((cost ?? 0) / 100).toFixed(2)}
        </span>
      </div>
    </div>
  )
}

function InlineLegend({ palette }: { palette: ChartPalette }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full inline-block" style={{ background: palette.primary }} />
        <span className="text-xs" style={{ color: palette.textSecondary }}>Tokens used</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full inline-block" style={{ background: palette.violet }} />
        <span className="text-xs" style={{ color: palette.textSecondary }}>Cost (USD)</span>
      </div>
    </div>
  )
}

export function TokenUsageChart({ data: propData, demoMode = false }: TokenUsageChartProps) {
  const palette = useChartPalette()
  const data = demoMode || !propData ? generateDemoData() : propData

  const tickInterval = Math.max(1, Math.floor(data.length / 8))
  const filteredTicks = data.filter((_, i) => i % tickInterval === 0).map((d) => d.date)

  return (
    <div className="flex flex-col gap-3 w-full min-h-[220px] md:min-h-[280px]">
      <div className="flex justify-end">
        <InlineLegend palette={palette} />
      </div>

      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={data} margin={{ top: 4, right: 40, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="tuGradCyan" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={palette.primary} stopOpacity={0.22} />
              <stop offset="95%" stopColor={palette.primary} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="tuGradPurple" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={palette.violet} stopOpacity={0.2} />
              <stop offset="95%" stopColor={palette.violet} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke={palette.gridStroke}
            vertical={false}
          />

          <XAxis
            dataKey="date"
            ticks={filteredTicks}
            tickFormatter={(v: string) =>
              new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            }
            tick={{ fill: palette.axisFill, fontSize: 11, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
          />

          {/* Left Y: tokens */}
          <YAxis
            yAxisId="tokens"
            orientation="left"
            tickFormatter={formatCompact}
            tick={{ fill: palette.axisFill, fontSize: 11, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
            width={40}
          />

          {/* Right Y: cost */}
          <YAxis
            yAxisId="cost"
            orientation="right"
            tickFormatter={formatCostAxis}
            tick={{ fill: palette.axisFill, fontSize: 11, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
            width={44}
          />

          <Tooltip
            content={<CustomTooltip palette={palette} />}
            cursor={{ stroke: palette.cursorStroke, strokeWidth: 1 }}
          />

          <Area
            yAxisId="tokens"
            type="monotone"
            dataKey="tokens"
            stroke={palette.primary}
            strokeWidth={2}
            fill="url(#tuGradCyan)"
            dot={false}
            activeDot={{ r: 4, fill: palette.primary, stroke: palette.surface, strokeWidth: 2 }}
            isAnimationActive
            animationDuration={300}
            animationEasing="ease-out"
          />

          <Area
            yAxisId="cost"
            type="monotone"
            dataKey="cost_cents"
            stroke={palette.violet}
            strokeWidth={2}
            fill="url(#tuGradPurple)"
            dot={false}
            activeDot={{ r: 4, fill: palette.violet, stroke: palette.surface, strokeWidth: 2 }}
            isAnimationActive
            animationDuration={300}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
