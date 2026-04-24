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
import { formatNumber, formatPercent } from '@/lib/utils/formatters'

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

// Bin colors: gradient from danger → warning → cyan
const BIN_COLORS = [
  '#FF4757', // 0-10
  '#FF5F6D', // 11-20
  '#FF7C3C', // 21-30
  '#FFAE42', // 31-40
  '#FFCF72', // 41-50
  '#A8D080', // 51-60
  '#4DC4A0', // 61-70
  '#00D4AA', // 71-80
  '#00EDBE', // 81-90
  '#33FFD0', // 91-100
]

interface BinData {
  label: string
  count: number
  range: [number, number]
  fill: string
}

function buildBins(leads: Array<{ score: number }>): BinData[] {
  const bins: BinData[] = Array.from({ length: 10 }, (_, i) => ({
    label: `${i * 10 + 1}–${i * 10 + 10}`,
    count: 0,
    range: [i * 10 + 1, i * 10 + 10] as [number, number],
    fill: BIN_COLORS[i],
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
}

function CustomTooltip({ active, payload }: ScoreTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as BinData

  return (
    <div
      className="rounded-lg px-3 py-2.5 text-xs flex flex-col gap-1"
      style={{
        background: '#151B2E',
        border: '1px solid rgba(255,255,255,0.1)',
        color: '#F0F2F5',
      }}
    >
      <p className="font-semibold" style={{ color: d.fill }}>Score {d.label}</p>
      <div className="flex items-center justify-between gap-6">
        <span style={{ color: '#8B95A8' }}>Leads</span>
        <span style={{ fontFamily: 'var(--font-mono)', color: '#F0F2F5' }}>{formatNumber(d.count)}</span>
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
  const leads = demoMode || !propLeads ? DEMO_LEADS : propLeads
  const avgScore = propAvg ?? (demoMode ? DEMO_AVG : leads.reduce((s, l) => s + l.score, 0) / (leads.length || 1))
  const bins = buildBins(leads)

  const p25 = computePercentile(leads, 25)
  const p50 = computePercentile(leads, 50)
  const p75 = computePercentile(leads, 75)

  // Map score to x-axis bin label for ReferenceLine
  function scoreToLabel(s: number): string {
    const binIdx = Math.min(9, Math.floor(s / 10))
    return bins[binIdx].label
  }

  return (
    <div className="flex flex-col gap-3 w-full" style={{ minHeight: 280 }}>
      {/* KPI header */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs" style={{ color: '#8B95A8' }}>Average Score</span>
          <span
            className="text-2xl font-bold leading-none"
            style={{ color: '#00D4AA', fontFamily: 'var(--font-mono)' }}
          >
            {Math.round(avgScore)}
          </span>
        </div>
        <div
          className="w-px self-stretch"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        />
        <div className="flex gap-4 text-xs" style={{ color: '#8B95A8' }}>
          <div className="flex flex-col gap-0.5">
            <span>P25</span>
            <span style={{ color: '#F0F2F5', fontFamily: 'var(--font-mono)' }}>{p25}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span>Median</span>
            <span style={{ color: '#F0F2F5', fontFamily: 'var(--font-mono)' }}>{p50}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span>P75</span>
            <span style={{ color: '#F0F2F5', fontFamily: 'var(--font-mono)' }}>{p75}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span>Total</span>
            <span style={{ color: '#F0F2F5', fontFamily: 'var(--font-mono)' }}>{formatNumber(leads.length)}</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={bins}
          margin={{ top: 4, right: 4, left: -8, bottom: 0 }}
          // @ts-ignore – recharts onClick type is overly narrow
          onClick={(e: { activePayload?: Array<{ payload: BinData }> }) => {
            if (e?.activePayload?.[0]) {
              const d = e.activePayload[0].payload
              onBinClick?.(d.range)
            }
          }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.04)"
            vertical={false}
          />

          <XAxis
            dataKey="label"
            tick={{ fill: '#8B95A8', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
          />

          <YAxis
            tickFormatter={formatNumber}
            tick={{ fill: '#8B95A8', fontSize: 11, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
            width={36}
          />

          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          />

          {/* Percentile reference lines */}
          <ReferenceLine
            x={scoreToLabel(p25)}
            stroke="rgba(255,255,255,0.2)"
            strokeDasharray="4 4"
            label={{
              value: 'P25',
              position: 'top',
              fill: '#8B95A8',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
            }}
          />
          <ReferenceLine
            x={scoreToLabel(p50)}
            stroke="rgba(255,255,255,0.3)"
            strokeDasharray="4 4"
            label={{
              value: 'P50',
              position: 'top',
              fill: '#8B95A8',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
            }}
          />
          <ReferenceLine
            x={scoreToLabel(p75)}
            stroke="rgba(255,255,255,0.2)"
            strokeDasharray="4 4"
            label={{
              value: 'P75',
              position: 'top',
              fill: '#8B95A8',
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
