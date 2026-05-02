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
} from 'recharts'
import { motion } from 'framer-motion'
import { formatNumber } from '@/lib/utils/formatters'
import { useChartPalette, type ChartPalette } from '@/lib/utils/chartColors'

type AgingBucket = 'active' | 'cooling' | 'stale' | 'dead'

interface AgingDataPoint {
  bucket: AgingBucket
  count: number
}

interface LeadAgingProps {
  data?: AgingDataPoint[]
  onBucketClick?: (bucket: AgingBucket) => void
  demoMode?: boolean
}

const DEMO_DATA: AgingDataPoint[] = [
  { bucket: 'active', count: 89 },
  { bucket: 'cooling', count: 124 },
  { bucket: 'stale', count: 97 },
  { bucket: 'dead', count: 37 },
]

interface BucketConfig {
  color: string
  label: string
  sublabel: string
}

function bucketConfig(palette: ChartPalette): Record<AgingBucket, BucketConfig> {
  return {
    active:  { color: palette.success, label: 'Active',  sublabel: '0–7d' },
    cooling: { color: palette.warning, label: 'Cooling', sublabel: '8–30d' },
    stale:   { color: palette.orange,  label: 'Stale',   sublabel: '31–60d' },
    dead:    { color: palette.danger,  label: 'Dead',    sublabel: '60d+' },
  }
}

interface ChartEntry {
  bucket: AgingBucket
  count: number
  label: string
  color: string
}

interface LeadAgingTooltipProps {
  active?: boolean
  payload?: Array<{ payload: ChartEntry }>
  palette: ChartPalette
}

function CustomTooltip({ active, payload, palette }: LeadAgingTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as ChartEntry
  const cfg = bucketConfig(palette)[d.bucket]

  return (
    <div
      className="rounded-lg px-3 py-2.5 text-xs flex flex-col gap-1"
      style={{
        background: palette.tooltipBg,
        border: `1px solid ${palette.tooltipBorder}`,
        color: palette.tooltipText,
      }}
    >
      <p className="font-semibold" style={{ color: cfg.color }}>
        {cfg.label} <span style={{ color: palette.textSecondary, fontWeight: 400 }}>({cfg.sublabel})</span>
      </p>
      <div className="flex items-center justify-between gap-6">
        <span style={{ color: palette.textSecondary }}>Leads</span>
        <span style={{ fontFamily: 'var(--font-mono)', color: palette.textPrimary }}>{formatNumber(d.count)}</span>
      </div>
    </div>
  )
}

// Custom label rendered on top of each bar — "dead" bucket gets a pulse animation
function CustomLabel(props: {
  x?: number
  y?: number
  width?: number
  value?: number
  bucket?: AgingBucket
  palette: ChartPalette
}) {
  const { x = 0, y = 0, width = 0, value = 0, bucket, palette } = props
  const isDead = bucket === 'dead'
  const cfg = bucket ? bucketConfig(palette)[bucket] : null

  const label = (
    <text
      x={x + width / 2}
      y={y - 6}
      textAnchor="middle"
      dominantBaseline="auto"
      fill={cfg?.color ?? palette.textPrimary}
      fontSize={12}
      fontFamily="var(--font-mono)"
      fontWeight={600}
    >
      {formatNumber(value)}
    </text>
  )

  if (!isDead) return label

  return (
    <motion.g
      animate={{ opacity: [1, 0.4, 1] }}
      transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
    >
      {label}
    </motion.g>
  )
}

export function LeadAging({ data: propData, onBucketClick, demoMode = false }: LeadAgingProps) {
  const palette = useChartPalette()
  const cfgMap = bucketConfig(palette)
  const raw = demoMode || !propData ? DEMO_DATA : propData

  const chartData: ChartEntry[] = raw.map((d) => ({
    ...d,
    label: `${cfgMap[d.bucket].label}\n${cfgMap[d.bucket].sublabel}`,
    color: cfgMap[d.bucket].color,
  }))

  const total = raw.reduce((s, d) => s + d.count, 0)

  return (
    <div className="flex flex-col gap-3 w-full min-h-[220px] md:min-h-[280px]">
      {/* Mini legend with share */}
      <div className="flex items-center gap-4 flex-wrap">
        {raw.map((d) => {
          const cfg = cfgMap[d.bucket]
          const pct = total > 0 ? Math.round((d.count / total) * 100) : 0
          return (
            <div key={d.bucket} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: cfg.color }} />
              <span className="text-xs" style={{ color: palette.textSecondary }}>
                {cfg.label}
              </span>
              <span
                className="text-xs font-semibold"
                style={{ color: cfg.color, fontFamily: 'var(--font-mono)' }}
              >
                {pct}%
              </span>
            </div>
          )
        })}
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={chartData}
          margin={{ top: 24, right: 4, left: -8, bottom: 0 }}
          // @ts-expect-error – recharts onClick type is overly narrow
          onClick={(e: { activePayload?: Array<{ payload: ChartEntry }> }) => {
            if (e?.activePayload?.[0]) {
              const d = e.activePayload[0].payload
              onBucketClick?.(d.bucket)
            }
          }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={palette.gridStroke}
            vertical={false}
          />

          <XAxis
            dataKey="bucket"
            tickFormatter={(v: AgingBucket) => {
              const cfg = cfgMap[v]
              return `${cfg.label} (${cfg.sublabel})`
            }}
            tick={{ fill: palette.axisFill, fontSize: 11 }}
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

          <Bar
            dataKey="count"
            radius={[4, 4, 0, 0]}
            cursor={onBucketClick ? 'pointer' : 'default'}
            isAnimationActive
            animationDuration={300}
            animationEasing="ease-out"
            // @ts-expect-error – recharts label prop accepts function components
            label={(props: { x?: number; y?: number; width?: number; value?: number; index?: number }) => (
              <CustomLabel
                x={props.x}
                y={props.y}
                width={props.width}
                value={props.value}
                bucket={chartData[props.index ?? 0]?.bucket}
                palette={palette}
              />
            )}
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
