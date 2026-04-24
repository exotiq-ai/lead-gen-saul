'use client'

import { type ReactNode } from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'score'

interface BadgeProps {
  variant?: BadgeVariant
  score?: number
  children?: ReactNode
  className?: string
}

function getScoreConfig(score: number): { label: string; classes: string } {
  if (score >= 80) {
    return {
      label: score.toString(),
      classes:
        'bg-[rgba(0,212,170,0.12)] text-[var(--color-saul-cyan)] border-[rgba(0,212,170,0.25)]',
    }
  }
  if (score >= 60) {
    return {
      label: score.toString(),
      classes:
        'bg-[rgba(59,130,246,0.12)] text-[#3B82F6] border-[rgba(59,130,246,0.25)]',
    }
  }
  if (score >= 40) {
    return {
      label: score.toString(),
      classes:
        'bg-[rgba(255,174,66,0.12)] text-[var(--color-saul-warning)] border-[rgba(255,174,66,0.25)]',
    }
  }
  return {
    label: score.toString(),
    classes:
      'bg-[rgba(255,71,87,0.12)] text-[var(--color-saul-danger)] border-[rgba(255,71,87,0.25)]',
  }
}

const variantClasses: Record<Exclude<BadgeVariant, 'score'>, string> = {
  default:
    'bg-[rgba(255,255,255,0.06)] text-[var(--color-saul-text-secondary)] border-[rgba(255,255,255,0.08)]',
  success:
    'bg-[rgba(0,212,170,0.12)] text-[var(--color-saul-cyan)] border-[rgba(0,212,170,0.25)]',
  warning:
    'bg-[rgba(255,174,66,0.12)] text-[var(--color-saul-warning)] border-[rgba(255,174,66,0.25)]',
  danger:
    'bg-[rgba(255,71,87,0.12)] text-[var(--color-saul-danger)] border-[rgba(255,71,87,0.25)]',
  info: 'bg-[rgba(59,130,246,0.12)] text-[#3B82F6] border-[rgba(59,130,246,0.25)]',
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
