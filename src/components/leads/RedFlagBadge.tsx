'use client'

import { Warning } from '@phosphor-icons/react'
import { Tooltip } from '@/components/ui/Tooltip'
import type { RedFlag } from '@/types/lead'

interface RedFlagBadgeProps {
  flags: RedFlag[]
}

function formatFlagCode(code: string): string {
  return code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function RedFlagBadge({ flags }: RedFlagBadgeProps) {
  if (flags.length === 0) return null

  if (flags.length === 1) {
    return (
      <Tooltip content={flags[0].reason} position="top">
        <span className="inline-flex items-center gap-1 cursor-default">
          <Warning
            size={14}
            weight="fill"
            className="text-[var(--color-saul-danger)] shrink-0"
          />
          <span className="text-[10px] font-medium text-[var(--color-saul-danger)] leading-none truncate max-w-[80px]">
            {formatFlagCode(flags[0].code)}
          </span>
        </span>
      </Tooltip>
    )
  }

  const tooltipContent = (
    <span className="flex flex-col gap-1">
      {flags.map((f) => (
        <span key={f.code} className="flex items-start gap-1.5">
          <Warning size={11} weight="fill" className="text-[var(--color-saul-danger)] mt-0.5 shrink-0" />
          <span className="text-[11px] leading-tight">{f.reason}</span>
        </span>
      ))}
    </span>
  )

  return (
    <Tooltip content={tooltipContent} position="top">
      <span className="inline-flex items-center gap-1 cursor-default">
        <Warning
          size={14}
          weight="fill"
          className="text-[var(--color-saul-danger)] shrink-0"
        />
        <span
          className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold leading-none"
          style={{
            background: 'rgba(255,71,87,0.18)',
            color: 'var(--color-saul-danger)',
            border: '1px solid rgba(255,71,87,0.3)',
          }}
        >
          {flags.length}
        </span>
      </span>
    </Tooltip>
  )
}
