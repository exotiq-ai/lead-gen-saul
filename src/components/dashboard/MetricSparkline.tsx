'use client'

import { useChartPalette } from '@/lib/utils/chartColors'

interface MetricSparklineProps {
  data: number[]
  /**
   * Optional explicit color override. When omitted, the line color is derived
   * from `trend`: positive → success, negative → danger, zero/undefined →
   * `palette.primary` for back-compat.
   */
  color?: string
  /**
   * Trend direction signal. When provided (and `color` is not), the sparkline
   * recolors to match: > 0 → success, < 0 → danger, === 0 → neutral.
   */
  trend?: number
  width?: number
  height?: number
}

function resolveColor(
  color: string | undefined,
  trend: number | undefined,
  fallbacks: { positive: string; negative: string; neutral: string; default: string },
): string {
  if (color) return color
  if (trend === undefined) return fallbacks.default
  if (trend > 0) return fallbacks.positive
  if (trend < 0) return fallbacks.negative
  return fallbacks.neutral
}

export function MetricSparkline({
  data,
  color,
  trend,
  width = 80,
  height = 32,
}: MetricSparklineProps) {
  const palette = useChartPalette()
  const resolvedColor = resolveColor(color, trend, {
    positive: palette.success,
    negative: palette.danger,
    neutral: palette.neutral,
    default: palette.primary,
  })
  if (!data || data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const padding = 2
  const innerW = width - padding * 2
  const innerH = height - padding * 2

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * innerW
    const y = padding + innerH - ((v - min) / range) * innerH
    return `${x},${y}`
  })

  const polylinePoints = points.join(' ')

  // Close path for gradient fill: go to bottom-right then bottom-left
  const lastX = padding + innerW
  const firstX = padding
  const bottomY = padding + innerH
  const fillPath = `M ${points[0]} L ${points.join(' L ')} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`

  const gradientId = `sparkline-grad-${resolvedColor.replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={resolvedColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={resolvedColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradientId})`} />
      <polyline
        points={polylinePoints}
        stroke={resolvedColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
