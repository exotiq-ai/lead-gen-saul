'use client'

interface MetricSparklineProps {
  data: number[]
  color?: string
  width?: number
  height?: number
}

export function MetricSparkline({
  data,
  color = '#00D4AA',
  width = 80,
  height = 32,
}: MetricSparklineProps) {
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

  const gradientId = `sparkline-grad-${color.replace('#', '')}`

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
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradientId})`} />
      <polyline
        points={polylinePoints}
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
