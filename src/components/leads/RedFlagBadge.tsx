'use client'

import { Warning } from '@phosphor-icons/react'
import { Tooltip } from '@/components/ui/Tooltip'

interface NormalizedRedFlag {
  code: string
  reason: string
  flagged_at: string
}

interface RedFlagBadgeProps {
  // Older imported leads may still store red_flags as string codes, while newer
  // scorer output stores { code, reason, flagged_at } objects. Keep the UI
  // defensive so filtering to red-flagged leads never crashes on legacy rows.
  flags: unknown
}

function formatFlagCode(code: string): string {
  return code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function normalizeFlags(flags: unknown): NormalizedRedFlag[] {
  if (!Array.isArray(flags)) return []

  return flags
    .map((flag): NormalizedRedFlag | null => {
      if (typeof flag === 'string') {
        return {
          code: flag,
          reason: formatFlagCode(flag),
          flagged_at: '',
        }
      }

      if (!flag || typeof flag !== 'object') return null

      const record = flag as Record<string, unknown>
      const code = typeof record.code === 'string' ? record.code : null
      if (!code) return null

      const reason = typeof record.reason === 'string' && record.reason.trim()
        ? record.reason
        : formatFlagCode(code)

      return {
        code,
        reason,
        flagged_at: typeof record.flagged_at === 'string' ? record.flagged_at : '',
      }
    })
    .filter((flag): flag is NormalizedRedFlag => flag !== null)
}

export function RedFlagBadge({ flags }: RedFlagBadgeProps) {
  const normalizedFlags = normalizeFlags(flags)
  if (normalizedFlags.length === 0) return null

  if (normalizedFlags.length === 1) {
    const [flag] = normalizedFlags
    return (
      <Tooltip content={flag.reason} position="top">
        <span className="inline-flex items-center gap-1 cursor-default">
          <Warning
            size={14}
            weight="fill"
            className="text-[var(--color-saul-caution)] shrink-0"
          />
          <span className="text-[10px] font-medium text-[var(--color-saul-caution)] leading-none truncate max-w-[80px]">
            {formatFlagCode(flag.code)}
          </span>
        </span>
      </Tooltip>
    )
  }

  const tooltipContent = (
    <span className="flex flex-col gap-1">
      {normalizedFlags.map((f) => (
        <span key={f.code} className="flex items-start gap-1.5">
          <Warning size={11} weight="fill" className="text-[var(--color-saul-caution)] mt-0.5 shrink-0" />
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
          className="text-[var(--color-saul-caution)] shrink-0"
        />
        <span
          className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold leading-none"
          style={{
            background: 'rgba(232,118,109,0.18)',
            color: 'var(--color-saul-caution)',
            border: '1px solid rgba(232,118,109,0.3)',
          }}
        >
          {normalizedFlags.length}
        </span>
      </span>
    </Tooltip>
  )
}
