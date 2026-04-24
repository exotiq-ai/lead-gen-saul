'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUp, ArrowDown } from '@phosphor-icons/react'
import { SkeletonKPI } from '@/components/ui/Skeleton'
import { MetricSparkline } from './MetricSparkline'

export interface KPICardProps {
  title: string
  value: number | string
  unit?: string
  trend?: number
  trendLabel?: string
  sparklineData?: number[]
  isLoading?: boolean
  format?: 'number' | 'compact' | 'percent' | 'currency'
  accentColor?: string
}

function formatValue(
  raw: number | string,
  fmt: KPICardProps['format'] = 'number',
): string {
  if (typeof raw === 'string') return raw
  switch (fmt) {
    case 'compact':
      return Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(raw)
    case 'percent':
      return raw.toLocaleString('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })
    case 'currency':
      return Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(raw)
    default:
      return raw.toLocaleString('en-US')
  }
}

function useCountUp(target: number, duration = 1200) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (typeof target !== 'number') return
    const startVal = 0

    function tick(ts: number) {
      if (startRef.current === null) startRef.current = ts
      const elapsed = ts - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(startVal + (target - startVal) * eased)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      startRef.current = null
    }
  }, [target, duration])

  return display
}

export function KPICard({
  title,
  value,
  unit,
  trend,
  trendLabel,
  sparklineData,
  isLoading = false,
  format = 'number',
  accentColor = '#00D4AA',
}: KPICardProps) {
  const numericTarget = typeof value === 'number' ? value : parseFloat(String(value)) || 0
  const animated = useCountUp(numericTarget)

  if (isLoading) {
    return <SkeletonKPI />
  }

  const trendPositive = trend !== undefined && trend >= 0
  const TrendIcon = trendPositive ? ArrowUp : ArrowDown

  const displayStr =
    typeof value === 'string'
      ? value
      : formatValue(animated, format)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      whileHover={{
        borderColor: 'rgba(0,212,170,0.15)',
        boxShadow: '0 0 0 1px rgba(0,212,170,0.15)',
      }}
      className="flex flex-col gap-2 p-5 rounded-[8px] bg-[var(--color-saul-bg-700)] border border-[rgba(255,255,255,0.06)] transition-all duration-200 cursor-default select-none"
    >
      {/* Title row */}
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-[var(--color-saul-text-secondary)] font-medium uppercase tracking-[0.05em]">
          {title}
        </span>
        {sparklineData && sparklineData.length >= 2 && (
          <MetricSparkline data={sparklineData} color={accentColor} />
        )}
      </div>

      {/* Main value */}
      <div className="flex items-end gap-1.5 mt-1">
        <span
          className="font-mono text-[32px] font-semibold leading-none text-[var(--color-saul-text-primary)] tabular-nums"
          aria-label={`${title}: ${formatValue(numericTarget, format)}${unit ? ' ' + unit : ''}`}
        >
          {displayStr}
        </span>
        {unit && (
          <span className="text-[14px] text-[var(--color-saul-text-secondary)] font-medium mb-0.5">
            {unit}
          </span>
        )}
      </div>

      {/* Trend */}
      {trend !== undefined && (
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className={[
              'flex items-center gap-0.5 text-[12px] font-semibold',
              trendPositive
                ? 'text-[var(--color-saul-success)]'
                : 'text-[var(--color-saul-danger)]',
            ].join(' ')}
          >
            <TrendIcon size={11} weight="bold" aria-hidden="true" />
            {Math.abs(trend).toFixed(1)}%
          </span>
          {trendLabel && (
            <span className="text-[11px] text-[var(--color-saul-text-secondary)]">
              {trendLabel}
            </span>
          )}
        </div>
      )}
    </motion.div>
  )
}
