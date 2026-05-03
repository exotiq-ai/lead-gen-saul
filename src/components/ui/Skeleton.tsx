import { type CSSProperties } from 'react'

interface SkeletonBaseProps {
  className?: string
  style?: CSSProperties
}

function SkeletonBase({ className = '', style }: SkeletonBaseProps) {
  return (
    <div
      className={`skeleton-shimmer rounded-[4px] ${className}`}
      style={style}
      aria-hidden="true"
    />
  )
}

// SkeletonText — one or more lines of text placeholder
interface SkeletonTextProps {
  lines?: number
  className?: string
  lastLineWidth?: string
}

export function SkeletonText({
  lines = 1,
  className = '',
  lastLineWidth = '65%',
}: SkeletonTextProps) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBase
          key={i}
          className={`h-3 ${i === lines - 1 && lines > 1 ? '' : 'w-full'}`}
          style={{ width: i === lines - 1 && lines > 1 ? lastLineWidth : '100%' }}
        />
      ))}
    </div>
  )
}

// SkeletonKPI — number + label + sparkline shape
interface SkeletonKPIProps {
  className?: string
}

export function SkeletonKPI({ className = '' }: SkeletonKPIProps) {
  return (
    <div
      className={`flex flex-col gap-3 p-5 rounded-[8px] bg-[var(--color-saul-bg-700)] border border-[var(--color-saul-border)] ${className}`}
      aria-hidden="true"
    >
      <div className="flex items-center justify-between">
        <SkeletonBase className="h-3 w-24" />
        <SkeletonBase className="h-5 w-5 rounded-full" />
      </div>
      <SkeletonBase className="h-8 w-32" />
      <div className="flex items-end gap-0.5 h-8">
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonBase
            key={i}
            className="flex-1 rounded-[2px]"
            style={{
              height: `${20 + Math.sin(i * 0.8) * 12}px`,
            }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <SkeletonBase className="h-3 w-8 rounded-full" />
        <SkeletonBase className="h-3 w-16" />
      </div>
    </div>
  )
}

// SkeletonChart — rectangle placeholder for chart area
interface SkeletonChartProps {
  height?: number | string
  className?: string
}

export function SkeletonChart({ height = 240, className = '' }: SkeletonChartProps) {
  return (
    <div className={`flex flex-col gap-3 ${className}`} aria-hidden="true">
      <div className="flex items-center justify-between">
        <SkeletonBase className="h-3 w-28" />
        <div className="flex gap-2">
          <SkeletonBase className="h-6 w-14 rounded-full" />
          <SkeletonBase className="h-6 w-14 rounded-full" />
        </div>
      </div>
      <SkeletonBase
        className="w-full rounded-[6px]"
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
      />
      <div className="flex justify-between">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBase key={i} className="h-2.5 w-8" />
        ))}
      </div>
    </div>
  )
}

// SkeletonRow — single table row shape
interface SkeletonRowProps {
  columns?: number
  className?: string
}

export function SkeletonRow({ columns = 5, className = '' }: SkeletonRowProps) {
  const widths = ['w-28', 'w-40', 'w-24', 'w-16', 'w-20']

  return (
    <div
      className={`flex items-center gap-4 px-4 py-3 border-b border-[var(--color-saul-border-soft)] ${className}`}
      aria-hidden="true"
    >
      <SkeletonBase className="h-7 w-7 rounded-full shrink-0" />
      {Array.from({ length: columns }).map((_, i) => (
        <SkeletonBase
          key={i}
          className={`h-3 ${widths[i % widths.length]}`}
        />
      ))}
    </div>
  )
}

// SkeletonBadge — small pill placeholder
interface SkeletonBadgeProps {
  className?: string
}

export function SkeletonBadge({ className = '' }: SkeletonBadgeProps) {
  return (
    <SkeletonBase className={`h-5 w-14 rounded-full ${className}`} />
  )
}

// SkeletonTable — full table with header + rows
interface SkeletonTableProps {
  rows?: number
  columns?: number
  className?: string
}

export function SkeletonTable({ rows = 5, columns = 5, className = '' }: SkeletonTableProps) {
  return (
    <div className={`rounded-[8px] border border-[var(--color-saul-border)] overflow-hidden ${className}`}>
      <div className="flex items-center gap-4 px-4 py-3 bg-[var(--color-saul-bg-600)] border-b border-[var(--color-saul-border)]">
        <SkeletonBase className="h-7 w-7 rounded-full shrink-0" />
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonBase key={i} className="h-2.5 w-20" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} columns={columns} />
      ))}
    </div>
  )
}

// SkeletonBlock — generic shimmering rectangle. Use for ad-hoc placeholders
// (cards, panels, lazy-loaded sections) instead of bespoke `animate-pulse` divs.
interface SkeletonBlockProps {
  className?: string
  height?: number | string
  width?: number | string
  rounded?: string
}

export function SkeletonBlock({
  className = '',
  height,
  width,
  rounded = 'rounded-[8px]',
}: SkeletonBlockProps) {
  return (
    <div
      className={`skeleton-shimmer ${rounded} ${className}`}
      style={{
        height: height != null ? (typeof height === 'number' ? `${height}px` : height) : undefined,
        width: width != null ? (typeof width === 'number' ? `${width}px` : width) : undefined,
      }}
      aria-hidden="true"
    />
  )
}

export type {
  SkeletonTextProps,
  SkeletonKPIProps,
  SkeletonChartProps,
  SkeletonRowProps,
  SkeletonBlockProps,
}
