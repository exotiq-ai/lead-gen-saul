'use client'

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { formatNumber } from '@/lib/utils/formatters'
import { useChartPalette, type ChartPalette } from '@/lib/utils/chartColors'

interface ScoreDistributionProps {
  leads?: Array<{ score: number }>
  avgScore?: number
  onBinClick?: (range: [number, number]) => void
  demoMode?: boolean
}

// Bell curve centered ~52, slightly right-skewed, for exotic car rental leads
const DEMO_LEADS: Array<{ score: number }> = (() => {
  const scores: Array<{ score: number }> = []
  const dist = [4, 8, 14, 22, 32, 38, 30, 22, 16, 8]
  dist.forEach((count, bin) => {
    const low = bin * 10 + 1
    const high = bin * 10 + 10
    for (let j = 0; j < count; j++) {
      scores.push({ score: Math.floor(Math.random() * (high - low + 1)) + low })
    }
  })
  return scores
})()

const DEMO_AVG = 52

interface BinData {
  label: string
  count: number
  range: [number, number]
  fill: string
}

/** Bin colors flow danger → warning → success across deciles. */
function buildBinColors(palette: ChartPalette): string[] {
  return [
    palette.danger,           // 0-10
    palette.danger,           // 11-20  (slight fade in light, kept consistent)
    palette.orange,           // 21-30
    palette.warning,          // 31-40
    palette.warning,          // 41-50
    palette.success,          // 51-60
    palette.success,          // 61-70
    palette.success,          // 71-80
    palette.success,          // 81-90
    palette.success,          // 91-100
  ]
}

function buildBins(leads: Array<{ score: number }>, palette: ChartPalette): BinData[] {
  const colors = buildBinColors(palette)
  const bins: BinData[] = Array.from({ length: 10 }, (_, i) => ({
    label: `${i * 10 + 1}–${i * 10 + 10}`,
    count: 0,
    range: [i * 10 + 1, i * 10 + 10] as [number, number],
    fill: colors[i],
  }))
  bins[0].label = '0–10'
  bins[0].range = [0, 10]

  for (const lead of leads) {
    const binIdx = Math.min(9, Math.floor(lead.score / 10))
    bins[binIdx].count++
  }
  return bins
}

function computePercentile(leads: Array<{ score: number }>, pct: number): number {
  if (!leads.length) return 0
  const sorted = [...leads].map((l) => l.score).sort((a, b) => a - b)
  const idx = Math.floor((pct / 100) * sorted.length)
  return sorted[Math.min(idx, sorted.length - 1)]
}

interface ScoreTooltipProps {
  active?: boolean
  payload?: Array<{ payload: BinData }>
  palette: ChartPalette
}

function CustomTooltip({ active, payload, palette }: ScoreTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as BinData

  return (
    <div
      className="rounded-lg px-3 py-2.5 text-xs flex flex-col gap-1"
      style={{
        background: palette.tooltipBg,
        border: `1px solid ${palette.tooltipBorder}`,
        color: palette.tooltipText,
      }}
    >
      <p className="font-semibold" style={{ color: d.fill }}>Score {d.label}</p>
      <div className="flex items-center justify-between gap-6">
        <span style={{ color: palette.textSecondary }}>Leads</span>
        <span style={{ fontFamily: 'var(--font-mono)', color: palette.textPrimary }}>{formatNumber(d.count)}</span>
      </div>
    </div>
  )
}

export function ScoreDistribution({
  leads: propLeads,
  avgScore: propAvg,
  onBinClick,
  demoMode = false,
}: ScoreDistributionProps) {
  const palette = useChartPalette()
  const leads = demoMode || !propLeads ? DEMO_LEADS : propLeads
  const avgScore = propAvg ?? (demoMode ? DEMO_AVG : leads.reduce((s, l) => s + l.score, 0) / (leads.length || 1))
  const bins = buildBins(leads, palette)

  const p25 = computePercentile(leads, 25)
  const p50 = computePercentile(leads, 50)
  const p75 = computePercentile(leads, 75)

  // Map score to x-axis bin label for ReferenceLine
  function scoreToLabel(s: number): string {
    const binIdx = Math.min(9, Math.floor(s / 10))
    return bins[binIdx].label
  }

  return (
    <div className="flex flex-col gap-3 w-full min-h-[220px] md:min-h-[280px]">
      {/* KPI header */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs" style={{ color: palette.textSecondary }}>Average Score</span>
          <span
            className="text-2xl font-bold leading-none"
            style={{ color: palette.primary, fontFamily: 'var(--font-mono)' }}
          >
            {Math.round(avgScore)}
          </span>
        </div>
        <div
          className="w-px self-stretch"
          style={{ background: palette.divider }}
        />
        <div className="flex gap-4 text-xs" style={{ color: palette.textSecondary }}>
          <div className="flex flex-col gap-0.5">
            <span>P25</span>
            <span style={{ color: palette.textPrimary, fontFamily: 'var(--font-mono)' }}>{p25}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span>Median</span>
            <span style={{ color: palette.textPrimary, fontFamily: 'var(--font-mono)' }}>{p50}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span>P75</span>
            <span style={{ color: palette.textPrimary, fontFamily: 'var(--font-mono)' }}>{p75}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span>Total</span>
            <span style={{ color: palette.textPrimary, fontFamily: 'var(--font-mono)' }}>{formatNumber(leads.length)}</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={bins}
          margin={{ top: 4, right: 4, left: -8, bottom: 0 }}
          // @ts-expect-error – recharts onClick type is overly narrow
          onClick={(e: { activePayload?: Array<{ payload: BinData }> }) => {
            if (e?.activePayload?.[0]) {
              const d = e.activePayload[0].payload
              onBinClick?.(d.range)
            }
          }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={palette.gridStroke}
            vertical={false}
          />

          <XAxis
            dataKey="label"
            tick={{ fill: palette.axisFill, fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
          />

          <YAxis
            tickFormatter={formatNumber}
            tick={{ fill: palette.axisFill, fontSize: 11, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
            width={36}
          />

          <Tooltip
            content={<CustomTooltip palette={palette} />}
            cursor={{ fill: palette.cursorFill }}
          />

          {/* Percentile reference lines */}
          <ReferenceLine
            x={scoreToLabel(p25)}
            stroke={palette.divider}
            strokeDasharray="4 4"
            label={{
              value: 'P25',
              position: 'top',
              fill: palette.axisFill,
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
            }}
          />
          <ReferenceLine
            x={scoreToLabel(p50)}
            stroke={palette.divider}
            strokeDasharray="4 4"
            label={{
              value: 'P50',
              position: 'top',
              fill: palette.axisFill,
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
            }}
          />
          <ReferenceLine
            x={scoreToLabel(p75)}
            stroke={palette.divider}
            strokeDasharray="4 4"
            label={{
              value: 'P75',
              position: 'top',
              fill: palette.axisFill,
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
            }}
          />

          <Bar
            dataKey="count"
            radius={[4, 4, 0, 0]}
            cursor={onBinClick ? 'pointer' : 'default'}
            isAnimationActive
            animationDuration={300}
            animationEasing="ease-out"
          >
            {bins.map((bin, i) => (
              <Cell key={i} fill={bin.fill} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
