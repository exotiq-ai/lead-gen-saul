'use client'

import { useState } from 'react'
import { formatPercent } from '@/lib/utils/formatters'

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

function rateToColor(rate: number, max: number, type: 'predicted' | 'actual'): string {
  const intensity = Math.min(1, rate / max)
  if (type === 'predicted') {
    // Purple scale
    const alpha = 0.15 + intensity * 0.7
    return `rgba(168,85,247,${alpha.toFixed(2)})`
  } else {
    // Cyan scale
    const alpha = 0.15 + intensity * 0.7
    return `rgba(0,212,170,${alpha.toFixed(2)})`
  }
}

function rateToTextColor(rate: number, max: number): string {
  const intensity = Math.min(1, rate / max)
  return intensity > 0.5 ? '#F0F2F5' : '#8B95A8'
}

export function ConversionCohort({ data: propData, demoMode = false }: ConversionCohortProps) {
  const data = demoMode || !propData ? DEMO_DATA : propData
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  const maxPredicted = Math.max(...data.map((d) => d.predicted))
  const maxActual = Math.max(...data.map((d) => d.actual))
  const maxVal = Math.max(maxPredicted, maxActual)

  return (
    <div className="flex flex-col gap-3 w-full min-h-[220px] md:min-h-[280px]">
      {/* Legend */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ background: 'rgba(168,85,247,0.7)' }}
          />
          <span className="text-xs" style={{ color: '#8B95A8' }}>Predicted conv. rate</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ background: 'rgba(0,212,170,0.7)' }}
          />
          <span className="text-xs" style={{ color: '#8B95A8' }}>Actual conv. rate</span>
        </div>
      </div>

      {/* Header row */}
      <div
        className="grid text-xs font-medium"
        style={{
          gridTemplateColumns: '80px 1fr 1fr 72px',
          color: '#8B95A8',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
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
                background: isHovered ? 'rgba(255,255,255,0.04)' : 'transparent',
                cursor: 'default',
              }}
              onMouseEnter={() => setHoveredRow(row.decile)}
              onMouseLeave={() => setHoveredRow(null)}
            >
              {/* Decile label */}
              <span
                className="text-xs font-medium"
                style={{ color: '#8B95A8', fontFamily: 'var(--font-mono)' }}
              >
                {row.decile}
              </span>

              {/* Predicted cell */}
              <div className="flex justify-center px-1">
                <div
                  className="rounded px-2 py-1 text-xs font-semibold text-center w-full"
                  style={{
                    background: rateToColor(row.predicted, maxVal, 'predicted'),
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
                    background: rateToColor(row.actual, maxVal, 'actual'),
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
                  color: delta >= 0 ? '#00D4AA' : '#FF4757',
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
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: '#8B95A8' }}
      >
        <span>
          Model accuracy:{' '}
          <span style={{ color: '#F0F2F5', fontFamily: 'var(--font-mono)' }}>
            {formatPercent(
              100 -
                (data.reduce((s, d) => s + Math.abs(d.actual - d.predicted), 0) /
                  data.reduce((s, d) => s + d.predicted, 0)) *
                  100
            )}
          </span>
        </span>
        <span>
          Avg predicted:{' '}
          <span style={{ color: '#A855F7', fontFamily: 'var(--font-mono)' }}>
            {formatPercent(data.reduce((s, d) => s + d.predicted, 0) / data.length)}
          </span>{' '}
          · Avg actual:{' '}
          <span style={{ color: '#00D4AA', fontFamily: 'var(--font-mono)' }}>
            {formatPercent(data.reduce((s, d) => s + d.actual, 0) / data.length)}
          </span>
        </span>
      </div>
    </div>
  )
}
