'use client'

import { useState } from 'react'
import { ChartBar, Warning } from '@phosphor-icons/react'
import { SkeletonChart } from '@/components/ui'

type TimeRange = '7d' | '30d' | '90d' | 'all'

interface ChartContainerProps {
  title: string
  subtitle?: string
  timeRangeSelector?: boolean
  onTimeRangeChange?: (range: TimeRange) => void
  children: React.ReactNode
  isLoading?: boolean
  error?: string | null
  isEmpty?: boolean
  emptyMessage?: string
}

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
  { label: 'All', value: 'all' },
]

export function ChartContainer({
  title,
  subtitle,
  timeRangeSelector = false,
  onTimeRangeChange,
  children,
  isLoading = false,
  error = null,
  isEmpty = false,
  emptyMessage = 'No data available for this period yet.',
}: ChartContainerProps) {
  const [activeRange, setActiveRange] = useState<TimeRange>('30d')

  function handleRangeChange(range: TimeRange) {
    setActiveRange(range)
    onTimeRangeChange?.(range)
  }

  return (
    <div
      className="rounded-xl p-6 flex flex-col gap-4"
      style={{
        background: 'var(--color-saul-bg-700)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h3
            className="text-sm font-semibold leading-tight"
            style={{ color: 'var(--color-saul-text-primary)', fontFamily: 'var(--font-sans)' }}
          >
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs" style={{ color: 'var(--color-saul-text-secondary)' }}>
              {subtitle}
            </p>
          )}
        </div>

        {timeRangeSelector && !isLoading && !error && (
          <div
            className="flex items-center gap-0.5 rounded-lg p-0.5 shrink-0"
            style={{ background: 'var(--color-saul-bg-600)' }}
          >
            {TIME_RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => handleRangeChange(r.value)}
                className="px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer"
                style={{
                  background: activeRange === r.value ? 'var(--color-saul-cyan)' : 'transparent',
                  color:
                    activeRange === r.value
                      ? '#0A0E17'
                      : 'var(--color-saul-text-secondary)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col justify-center min-h-[220px] md:min-h-[280px]">
        {isLoading ? (
          <SkeletonChart height={280} />
        ) : error ? (
          <ErrorState message={error} />
        ) : isEmpty ? (
          <EmptyState message={emptyMessage} />
        ) : (
          children
        )}
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 h-[280px]">
      <div
        className="flex items-center justify-center w-10 h-10 rounded-full"
        style={{ background: 'rgba(255,71,87,0.12)' }}
      >
        <Warning size={20} weight="fill" style={{ color: 'var(--color-saul-danger)' }} />
      </div>
      <div className="flex flex-col items-center gap-1 text-center max-w-xs">
        <p className="text-sm font-medium" style={{ color: 'var(--color-saul-text-primary)' }}>
          Failed to load chart data
        </p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-saul-text-secondary)' }}>
          {message}
        </p>
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 h-[280px]">
      <div
        className="flex items-center justify-center w-10 h-10 rounded-full"
        style={{ background: 'rgba(139,149,168,0.08)' }}
      >
        <ChartBar size={20} weight="duotone" style={{ color: 'var(--color-saul-text-tertiary)' }} />
      </div>
      <div className="flex flex-col items-center gap-1 text-center max-w-xs">
        <p className="text-sm font-medium" style={{ color: 'var(--color-saul-text-secondary)' }}>
          Nothing to display yet
        </p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-saul-text-tertiary)' }}>
          {message}
        </p>
      </div>
    </div>
  )
}
