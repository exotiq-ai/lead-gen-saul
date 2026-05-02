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

type TimeRange = '7d' | '30d' | '90d' | 'all'

interface VolumeDataPoint {
  date: string
  inbound: number
  outbound: number
}

interface LeadVolumeChartProps {
  data?: VolumeDataPoint[]
  timeRange?: TimeRange
  demoMode?: boolean
}

// Generate realistic 90-day demo data for an exotic car rental biz
function generateDemoData(): VolumeDataPoint[] {
  const now = new Date('2026-04-23')
  const points: VolumeDataPoint[] = []
  const EVENTS: Record<string, { inbound: number; outbound: number }> = {
    '2026-03-06': { inbound: 28, outbound: 14 }, // F1 weekend chatter
    '2026-03-07': { inbound: 35, outbound: 18 },
    '2026-03-08': { inbound: 42, outbound: 22 },
    '2026-03-15': { inbound: 31, outbound: 12 }, // Spring Break starts
    '2026-03-21': { inbound: 38, outbound: 16 },
    '2026-04-04': { inbound: 33, outbound: 20 }, // Easter weekend
    '2026-04-05': { inbound: 40, outbound: 24 },
    '2026-04-10': { inbound: 44, outbound: 28 }, // F1 Miami announcement
    '2026-04-11': { inbound: 52, outbound: 31 },
    '2026-04-18': { inbound: 39, outbound: 22 },
  }

  for (let i = 89; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    const dow = d.getDay() // 0=Sun, 6=Sat
    const isWeekend = dow === 0 || dow === 6

    const base = isWeekend ? 18 : 9
    const noise = Math.floor(Math.random() * 8)
    const event = EVENTS[key]

    points.push({
      date: key,
      inbound: event ? event.inbound : base + noise,
      outbound: event ? event.outbound : Math.floor((base + noise) * 0.45),
    })
  }
  return points
}

function sliceByRange(data: VolumeDataPoint[], range: TimeRange): VolumeDataPoint[] {
  if (range === 'all') return data
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  return data.slice(-days)
}

function formatXLabel(dateStr: string, range: TimeRange): string {
  const d = new Date(dateStr)
  if (range === '7d') return d.toLocaleDateString('en-US', { weekday: 'short' })
  if (range === '30d') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface LeadVolumeTooltipProps {
  active?: boolean
  payload?: Array<{ dataKey: string; color: string; value: number }>
  label?: string
  palette: ChartPalette
}

function CustomTooltip({ active, payload, label, palette }: LeadVolumeTooltipProps) {
  if (!active || !payload?.length) return null
  const date = new Date(label as string)
  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div
      className="rounded-lg px-3 py-2.5 text-xs flex flex-col gap-1.5"
      style={{
        background: palette.tooltipBg,
        border: `1px solid ${palette.tooltipBorder}`,
        color: palette.tooltipText,
      }}
    >
      <p className="font-medium mb-0.5" style={{ color: palette.textSecondary }}>{dateLabel}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: entry.color }}
          />
          <span style={{ color: palette.textSecondary }}>{entry.dataKey === 'inbound' ? 'Inbound' : 'Outbound'}:</span>
          <span className="font-semibold" style={{ fontFamily: 'var(--font-mono)', color: entry.color }}>
            {formatNumber(entry.value as number)}
          </span>
        </div>
      ))}
      <div
        className="flex items-center gap-2 pt-1"
        style={{ borderTop: `1px solid ${palette.divider}` }}
      >
        <span style={{ color: palette.textSecondary }}>Total:</span>
        <span className="font-semibold" style={{ fontFamily: 'var(--font-mono)', color: palette.textPrimary }}>
          {formatNumber((payload[0]?.value ?? 0) as number + (payload[1]?.value ?? 0) as number)}
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
        <span className="text-xs" style={{ color: palette.textSecondary }}>Inbound</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full inline-block" style={{ background: palette.info }} />
        <span className="text-xs" style={{ color: palette.textSecondary }}>Outbound</span>
      </div>
    </div>
  )
}

export function LeadVolumeChart({
  data: propData,
  timeRange = '30d',
  demoMode = false,
}: LeadVolumeChartProps) {
  const palette = useChartPalette()
  const allData = demoMode || !propData ? generateDemoData() : propData
  const data = sliceByRange(allData, timeRange)

  const rotateLabels = timeRange === '90d' || timeRange === 'all'
  // Tick interval: show ~8 labels max
  const tickInterval = Math.max(1, Math.floor(data.length / 8))

  const filteredTicks = data
    .filter((_, i) => i % tickInterval === 0)
    .map((d) => d.date)

  return (
    <div className="flex flex-col gap-3 w-full min-h-[220px] md:min-h-[280px]">
      <div className="flex justify-end">
        <InlineLegend palette={palette} />
      </div>

      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: rotateLabels ? 16 : 0 }}>
          <defs>
            <linearGradient id="lvGradCyan" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={palette.primary} stopOpacity={0.25} />
              <stop offset="95%" stopColor={palette.primary} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="lvGradBlue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={palette.info} stopOpacity={0.2} />
              <stop offset="95%" stopColor={palette.info} stopOpacity={0} />
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
            tickFormatter={(v: string) => formatXLabel(v, timeRange)}
            tick={{
              fill: palette.axisFill,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
            }}
            axisLine={false}
            tickLine={false}
            angle={rotateLabels ? -30 : 0}
            textAnchor={rotateLabels ? 'end' : 'middle'}
          />

          <YAxis
            tickFormatter={formatCompact}
            tick={{
              fill: palette.axisFill,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
            }}
            axisLine={false}
            tickLine={false}
            width={36}
          />

          <Tooltip
            content={<CustomTooltip palette={palette} />}
            cursor={{ stroke: palette.cursorStroke, strokeWidth: 1 }}
          />

          <Area
            type="monotone"
            dataKey="inbound"
            stroke={palette.primary}
            strokeWidth={2}
            fill="url(#lvGradCyan)"
            dot={false}
            activeDot={{ r: 4, fill: palette.primary, stroke: palette.surface, strokeWidth: 2 }}
            isAnimationActive
            animationDuration={300}
            animationEasing="ease-out"
          />

          <Area
            type="monotone"
            dataKey="outbound"
            stroke={palette.info}
            strokeWidth={2}
            fill="url(#lvGradBlue)"
            dot={false}
            activeDot={{ r: 4, fill: palette.info, stroke: palette.surface, strokeWidth: 2 }}
            isAnimationActive
            animationDuration={300}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
