'use client'

import { type ReactNode } from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'score'

interface BadgeProps {
  variant?: BadgeVariant
  score?: number
  children?: ReactNode
  className?: string
}

/**
 * Tonal class strings that pull foreground/background/border from a single
 * design token via color-mix(). All tokens flip with the active theme.
 */
const TONAL = {
  cyan:
    'bg-[color-mix(in_srgb,var(--color-saul-cyan)_12%,transparent)] text-[var(--color-saul-cyan)] border-[color-mix(in_srgb,var(--color-saul-cyan)_25%,transparent)]',
  info:
    'bg-[color-mix(in_srgb,var(--color-saul-info)_12%,transparent)] text-[var(--color-saul-info)] border-[color-mix(in_srgb,var(--color-saul-info)_25%,transparent)]',
  warning:
    'bg-[color-mix(in_srgb,var(--color-saul-warning)_12%,transparent)] text-[var(--color-saul-warning)] border-[color-mix(in_srgb,var(--color-saul-warning)_25%,transparent)]',
  danger:
    'bg-[color-mix(in_srgb,var(--color-saul-danger)_12%,transparent)] text-[var(--color-saul-danger)] border-[color-mix(in_srgb,var(--color-saul-danger)_25%,transparent)]',
  neutral:
    'bg-[var(--color-saul-overlay)] text-[var(--color-saul-text-secondary)] border-[var(--color-saul-border-strong)]',
} as const

function getScoreConfig(score: number): { label: string; classes: string } {
  if (score >= 80) return { label: score.toString(), classes: TONAL.cyan }
  if (score >= 60) return { label: score.toString(), classes: TONAL.info }
  if (score >= 40) return { label: score.toString(), classes: TONAL.warning }
  return { label: score.toString(), classes: TONAL.danger }
}

const variantClasses: Record<Exclude<BadgeVariant, 'score'>, string> = {
  default: TONAL.neutral,
  success: TONAL.cyan,
  warning: TONAL.warning,
  danger: TONAL.danger,
  info: TONAL.info,
}

export function Badge({ variant = 'default', score, children, className = '' }: BadgeProps) {
  if (variant === 'score') {
    const resolved = score !== undefined ? score : 0
    const config = getScoreConfig(resolved)
    return (
      <span
        className={`inline-flex items-center justify-center px-2 py-0.5 text-xs font-mono font-semibold border rounded-[4px] tabular-nums leading-none ${config.classes} ${className}`}
      >
        {config.label}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border rounded-[4px] leading-none ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
