'use client'

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts'
import { formatNumber, formatPercent } from '@/lib/utils/formatters'

interface SourceData {
  source: string
  total: number
  converted: number
  conversion_rate: number
  avg_score: number
}

interface SourceAttributionProps {
  data?: SourceData[]
  demoMode?: boolean
}

const DEMO_DATA: SourceData[] = [
  { source: 'Apollo Outbound', total: 180, converted: 36, conversion_rate: 20.0, avg_score: 68 },
  { source: 'Instagram Organic', total: 145, converted: 19, conversion_rate: 13.1, avg_score: 55 },
  { source: 'Referral', total: 89, converted: 18, conversion_rate: 20.2, avg_score: 72 },
  { source: 'Paid Search', total: 63, converted: 4, conversion_rate: 6.3, avg_score: 44 },
  { source: 'API / Webhook', total: 25, converted: 1, conversion_rate: 4.0, avg_score: 38 },
]

function getBarColor(rate: number): string {
  if (rate >= 15) return '#00D4AA'
  if (rate >= 10) return '#3B82F6'
  if (rate >= 5) return '#FFAE42'
  return '#FF4757'
}

interface SourceTooltipProps {
  active?: boolean
  payload?: Array<{ payload: SourceData }>
}

function CustomTooltip({ active, payload }: SourceTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as SourceData

  return (
    <div
      className="rounded-lg px-3 py-2.5 text-xs flex flex-col gap-1.5"
      style={{
        background: '#151B2E',
        border: '1px solid rgba(255,255,255,0.1)',
        color: '#F0F2F5',
        minWidth: 160,
      }}
    >
      <p className="font-semibold mb-0.5" style={{ color: '#F0F2F5' }}>{d.source}</p>
      <Row label="Total leads" value={formatNumber(d.total)} />
      <Row label="Converted" value={formatNumber(d.converted)} />
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6, marginTop: 2 }}>
        <Row label="Conv. rate" value={formatPercent(d.conversion_rate)} color={getBarColor(d.conversion_rate)} />
        <Row label="Avg score" value={String(d.avg_score)} />
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span style={{ color: '#8B95A8' }}>{label}</span>
      <span
        className="font-semibold"
        style={{ fontFamily: 'var(--font-mono)', color: color ?? '#F0F2F5' }}
      >
        {value}
      </span>
    </div>
  )
}

interface BarEntry {
  source: string
  total: number
  converted: number
  conversion_rate: number
  avg_score: number
  fill: string
}

export function SourceAttribution({ data: propData, demoMode = false }: SourceAttributionProps) {
  const raw = demoMode || !propData ? DEMO_DATA : propData
  const sorted = [...raw].sort((a, b) => b.total - a.total)

  const chartData: BarEntry[] = sorted.map((d) => ({
    ...d,
    fill: getBarColor(d.conversion_rate),
  }))

  // Conversion rate legend
  const legend = [
    { label: '≥15% conv', color: '#00D4AA' },
    { label: '10–15%', color: '#3B82F6' },
    { label: '5–10%', color: '#FFAE42' },
    { label: '<5%', color: '#FF4757' },
  ]

  return (
    <div className="flex flex-col gap-3 w-full" style={{ minHeight: 280 }}>
      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap">
        {legend.map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: l.color }} />
            <span className="text-xs" style={{ color: '#8B95A8' }}>{l.label}</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 60, left: 8, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.04)"
            horizontal={false}
          />

          <XAxis
            type="number"
            tickFormatter={formatNumber}
            tick={{ fill: '#8B95A8', fontSize: 11, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
          />

          <YAxis
            type="category"
            dataKey="source"
            tick={{ fill: '#8B95A8', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={110}
          />

          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          />

          <Bar
            dataKey="total"
            radius={[0, 4, 4, 0]}
            isAnimationActive
            animationDuration={300}
            animationEasing="ease-out"
          >
            {chartData.map((entry, index) => (
              <Cell key={index} fill={entry.fill} />
            ))}
            <LabelList
              dataKey="conversion_rate"
              position="right"
              formatter={(v: unknown) => `${(v as number).toFixed(1)}%`}
              style={{
                fill: '#8B95A8',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
