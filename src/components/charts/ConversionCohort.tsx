'use client'

import { useState } from 'react'
import { formatPercent } from '@/lib/utils/formatters'
import { useChartPalette } from '@/lib/utils/chartColors'

interface CohortDecile {
  decile: string
  predicted: number
  actual: number
}

interface ConversionCohortProps {
  data?: CohortDecile[]
  demoMode?: boolean
}

const DEMO_DATA: CohortDecile[] = [
  { decile: '0–10', predicted: 1.2, actual: 0.8 },
  { decile: '11–20', predicted: 2.4, actual: 1.9 },
  { decile: '21–30', predicted: 4.1, actual: 3.4 },
  { decile: '31–40', predicted: 6.8, actual: 5.9 },
  { decile: '41–50', predicted: 9.5, actual: 8.1 },
  { decile: '51–60', predicted: 13.2, actual: 11.7 },
  { decile: '61–70', predicted: 17.8, actual: 16.2 },
  { decile: '71–80', predicted: 23.5, actual: 22.0 },
  { decile: '81–90', predicted: 31.0, actual: 29.4 },
  { decile: '91–100', predicted: 42.5, actual: 40.1 },
]

/** Convert a `#RRGGBB` to `rgba(r,g,b,a)` so we can build the heatmap alpha ramps. */
function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const int = parseInt(m[1], 16)
  const r = (int >> 16) & 0xff
  const g = (int >> 8) & 0xff
  const b = int & 0xff
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`
}

function rateToColor(rate: number, max: number, baseColor: string): string {
  const intensity = Math.min(1, rate / max)
  const alpha = 0.15 + intensity * 0.7
  return hexWithAlpha(baseColor, alpha)
}

export function ConversionCohort({ data: propData, demoMode = false }: ConversionCohortProps) {
  const palette = useChartPalette()
  const data = demoMode || !propData || propData.length === 0 ? DEMO_DATA : propData
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  const maxPredicted = Math.max(...data.map((d) => d.predicted), 0)
  const maxActual = Math.max(...data.map((d) => d.actual), 0)
  const maxVal = Math.max(maxPredicted, maxActual, 1)

  function rateToTextColor(rate: number, max: number): string {
    const intensity = Math.min(1, rate / max)
    return intensity > 0.5 ? palette.textPrimary : palette.textSecondary
  }

  return (
    <div className="flex flex-col gap-3 w-full min-h-[220px] md:min-h-[280px]">
      {/* Legend */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ background: hexWithAlpha(palette.violet, 0.7) }}
          />
          <span className="text-xs" style={{ color: palette.textSecondary }}>Predicted conv. rate</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ background: hexWithAlpha(palette.primary, 0.7) }}
          />
          <span className="text-xs" style={{ color: palette.textSecondary }}>Actual conv. rate</span>
        </div>
      </div>

      {/* Header row */}
      <div
        className="grid text-xs font-medium"
        style={{
          gridTemplateColumns: '80px 1fr 1fr 72px',
          color: palette.textSecondary,
          borderBottom: `1px solid ${palette.divider}`,
          paddingBottom: 6,
        }}
      >
        <span>Decile</span>
        <span className="text-center">Predicted</span>
        <span className="text-center">Actual</span>
        <span className="text-right" style={{ fontFamily: 'var(--font-mono)' }}>Delta</span>
      </div>

      {/* Heatmap rows */}
      <div className="flex flex-col gap-1">
        {data.map((row) => {
          const delta = row.actual - row.predicted
          const isHovered = hoveredRow === row.decile

          return (
            <div
              key={row.decile}
              className="grid items-center rounded-md transition-all duration-150"
              style={{
                gridTemplateColumns: '80px 1fr 1fr 72px',
                padding: '6px 8px',
                background: isHovered ? palette.cursorFill : 'transparent',
                cursor: 'default',
              }}
              onMouseEnter={() => setHoveredRow(row.decile)}
              onMouseLeave={() => setHoveredRow(null)}
            >
              {/* Decile label */}
              <span
                className="text-xs font-medium"
                style={{ color: palette.textSecondary, fontFamily: 'var(--font-mono)' }}
              >
                {row.decile}
              </span>

              {/* Predicted cell */}
              <div className="flex justify-center px-1">
                <div
                  className="rounded px-2 py-1 text-xs font-semibold text-center w-full"
                  style={{
                    background: rateToColor(row.predicted, maxVal, palette.violet),
                    color: rateToTextColor(row.predicted, maxVal),
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {formatPercent(row.predicted)}
                </div>
              </div>

              {/* Actual cell */}
              <div className="flex justify-center px-1">
                <div
                  className="rounded px-2 py-1 text-xs font-semibold text-center w-full"
                  style={{
                    background: rateToColor(row.actual, maxVal, palette.primary),
                    color: rateToTextColor(row.actual, maxVal),
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {formatPercent(row.actual)}
                </div>
              </div>

              {/* Delta */}
              <span
                className="text-xs font-semibold text-right"
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: delta >= 0 ? palette.success : palette.danger,
                }}
              >
                {delta >= 0 ? '+' : ''}{formatPercent(delta)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Summary footer */}
      <div
        className="flex items-center justify-between text-xs pt-2"
        style={{ borderTop: `1px solid ${palette.divider}`, color: palette.textSecondary }}
      >
        <span>
          Model accuracy:{' '}
          <span style={{ color: palette.textPrimary, fontFamily: 'var(--font-mono)' }}>
            {formatPercent(
              100 -
                (data.reduce((s, d) => s + Math.abs(d.actual - d.predicted), 0) /
                  Math.max(data.reduce((s, d) => s + d.predicted, 0), 1)) *
                  100
            )}
          </span>
        </span>
        <span>
          Avg predicted:{' '}
          <span style={{ color: palette.violet, fontFamily: 'var(--font-mono)' }}>
            {formatPercent(data.reduce((s, d) => s + d.predicted, 0) / Math.max(data.length, 1))}
          </span>{' '}
          · Avg actual:{' '}
          <span style={{ color: palette.primary, fontFamily: 'var(--font-mono)' }}>
            {formatPercent(data.reduce((s, d) => s + d.actual, 0) / Math.max(data.length, 1))}
          </span>
        </span>
      </div>
    </div>
  )
}
