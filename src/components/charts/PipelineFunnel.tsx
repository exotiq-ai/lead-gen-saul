'use client'

import { motion } from 'framer-motion'
import { formatNumber } from '@/lib/utils/formatters'
import { useChartPalette, type ChartPalette } from '@/lib/utils/chartColors'

interface FunnelStage {
  id: string
  name: string
  count: number
  avgScore: number
  color?: string
  position: number
}

interface PipelineFunnelProps {
  stages?: FunnelStage[]
  onStageClick?: (stageId: string) => void
  selectedStageId?: string | null
  demoMode?: boolean
}

const DEMO_STAGES: FunnelStage[] = [
  { id: 'new', name: 'New', count: 200, avgScore: 38, position: 0 },
  { id: 'contacted', name: 'Contacted', count: 120, avgScore: 52, position: 1 },
  { id: 'engaged', name: 'Engaged', count: 80, avgScore: 61, position: 2 },
  { id: 'qualified', name: 'Qualified', count: 60, avgScore: 74, position: 3 },
  { id: 'won', name: 'Won', count: 20, avgScore: 88, position: 4 },
]

function getScoreBadgeColor(score: number, palette: ChartPalette): string {
  if (score >= 80) return `${palette.success}33`
  if (score >= 60) return `${palette.info}33`
  if (score >= 40) return `${palette.warning}33`
  return `${palette.danger}33`
}

function getScoreTextColor(score: number, palette: ChartPalette): string {
  if (score >= 80) return palette.success
  if (score >= 60) return palette.info
  if (score >= 40) return palette.warning
  return palette.danger
}

export function PipelineFunnel({
  stages: propStages,
  onStageClick,
  selectedStageId,
  demoMode = false,
}: PipelineFunnelProps) {
  const palette = useChartPalette()
  const stages = demoMode || !propStages ? DEMO_STAGES : propStages
  const sorted = [...stages].sort((a, b) => a.position - b.position)
  const maxCount = sorted[0]?.count ?? 1

  const stageColors = [
    palette.series[0],
    palette.series[1],
    palette.series[2],
    palette.series[3],
    palette.series[4],
  ]

  return (
    <div className="flex flex-col gap-0 w-full select-none min-h-[220px] md:min-h-[280px]">
      {sorted.map((stage, i) => {
        const widthPct = (stage.count / maxCount) * 100
        const prevCount = i > 0 ? sorted[i - 1].count : null
        const dropPct = prevCount != null ? Math.round(((prevCount - stage.count) / prevCount) * 100) : null
        const isSelected = selectedStageId === stage.id
        const color = stage.color ?? stageColors[i % stageColors.length]

        // clip-path trapezoid that narrows as widthPct shrinks
        // We center the bar. The clipping creates the trapezoid by narrowing relative to parent.
        const trapLeft = ((100 - widthPct) / 2)
        const nextStage = sorted[i + 1]
        const nextWidthPct = nextStage ? (nextStage.count / maxCount) * 100 : widthPct - 8
        const bottomTrapLeft = ((100 - nextWidthPct) / 2)

        const clipPath = `polygon(${trapLeft}% 0%, ${100 - trapLeft}% 0%, ${100 - bottomTrapLeft}% 100%, ${bottomTrapLeft}% 100%)`

        return (
          <div key={stage.id} className="flex flex-col items-center">
            {/* Drop-off label */}
            {dropPct !== null && (
              <div
                className="flex items-center gap-1 py-1 text-xs"
                style={{ color: 'var(--color-saul-text-secondary)' }}
              >
                <span>↓</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{dropPct}% drop</span>
              </div>
            )}

            {/* Stage bar */}
            <motion.div
              className="relative w-full cursor-pointer"
              style={{ height: 52 }}
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: i * 0.05, ease: 'easeOut' }}
              onClick={() => onStageClick?.(stage.id)}
            >
              {/* Trapezoid shape */}
              <div
                className="absolute inset-0 transition-all duration-200"
                style={{
                  clipPath,
                  background: isSelected
                    ? `linear-gradient(135deg, ${color}33 0%, ${color}18 100%)`
                    : `linear-gradient(135deg, ${color}22 0%, ${color}0d 100%)`,
                  border: `1px solid ${isSelected ? color : `${color}44`}`,
                  borderRadius: 4,
                }}
              />

              {/* Content row — sits on top, centered within trapezoid bounds */}
              <div
                className="absolute inset-0 flex items-center justify-between px-4"
                style={{
                  marginLeft: `${trapLeft}%`,
                  marginRight: `${trapLeft}%`,
                  width: `${widthPct}%`,
                }}
              >
                <span
                  className="text-sm font-medium truncate"
                  style={{ color: isSelected ? color : 'var(--color-saul-text-primary)' }}
                >
                  {stage.name}
                </span>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Avg score badge */}
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      background: getScoreBadgeColor(stage.avgScore, palette),
                      color: getScoreTextColor(stage.avgScore, palette),
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {stage.avgScore}
                  </span>

                  {/* Lead count */}
                  <span
                    className="text-sm font-semibold"
                    style={{ color: color, fontFamily: 'var(--font-mono)' }}
                  >
                    {formatNumber(stage.count)}
                  </span>
                </div>
              </div>

              {/* Selected indicator stripe */}
              {isSelected && (
                <div
                  className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l"
                  style={{ background: color, marginLeft: `${trapLeft}%` }}
                />
              )}
            </motion.div>
          </div>
        )
      })}

      {/* Summary footer */}
      <div
        className="mt-4 pt-4 flex items-center justify-between text-xs"
        style={{
          borderTop: `1px solid ${palette.divider}`,
          color: 'var(--color-saul-text-secondary)',
        }}
      >
        <span>
          Total:{' '}
          <span style={{ color: 'var(--color-saul-text-primary)', fontFamily: 'var(--font-mono)' }}>
            {formatNumber(sorted[0]?.count ?? 0)}
          </span>{' '}
          leads entered
        </span>
        {sorted.length > 1 && (
          <span>
            Win rate:{' '}
            <span style={{ color: 'var(--color-saul-cyan)', fontFamily: 'var(--font-mono)' }}>
              {Math.round(((sorted[sorted.length - 1].count) / (sorted[0]?.count ?? 1)) * 100)}%
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
