import { Tray, type Icon as PhosphorIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  /**
   * Phosphor icon component (e.g. `Tray`, `Funnel`). Falls back to `Tray`
   * to keep the visual rhythm consistent across pages.
   */
  icon?: PhosphorIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  /**
   * Optional class for outermost wrapper. Use sparingly — most callers
   * should rely on the default 24px+ vertical padding.
   */
  className?: string
}

export function EmptyState({
  icon: Icon = Tray,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center text-center gap-3 px-6 py-8',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span
        className="flex items-center justify-center w-12 h-12 rounded-[10px] bg-[var(--color-saul-overlay-low)] border border-[var(--color-saul-border)]"
        aria-hidden="true"
      >
        <Icon
          size={22}
          weight="duotone"
          className="text-[var(--color-saul-text-tertiary)]"
        />
      </span>
      <div className="flex flex-col gap-1 max-w-sm">
        <p className="text-[14px] font-semibold text-[var(--color-saul-text-primary)]">
          {title}
        </p>
        {description ? (
          <p className="text-[12px] leading-relaxed text-[var(--color-saul-text-secondary)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
