'use client'

import useSWR from 'swr'
import { motion, AnimatePresence } from 'framer-motion'
import {
  EnvelopeSimple,
  Phone,
  ChatCircle,
  ArrowsClockwise,
  Star,
  Lightning,
} from '@phosphor-icons/react'
import { formatRelative } from '@/lib/utils/formatters'
import { useTenantId } from '@/lib/hooks/useTenant'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Activity {
  id: string
  company_name: string
  score: number | null
  activity_type: string
  human_label: string
  created_at: string
}

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  dm_sent: EnvelopeSimple,
  dm_opened: EnvelopeSimple,
  dm_replied: ChatCircle,
  call_made: Phone,
  call_answered: Phone,
  score_changed: Star,
  enriched: ArrowsClockwise,
  form_submitted: Lightning,
}

const ACTIVITY_COLORS: Record<string, string> = {
  dm_sent: 'text-[var(--color-saul-cyan)]',
  dm_opened: 'text-[var(--color-saul-cyan)]',
  dm_replied: 'text-emerald-400',
  call_made: 'text-violet-400',
  call_answered: 'text-emerald-400',
  score_changed: 'text-amber-400',
  enriched: 'text-blue-400',
  form_submitted: 'text-[var(--color-saul-cyan)]',
}

export function ActivityFeed() {
  const tenantId = useTenantId()
  const { data, isLoading } = useSWR(
    `/api/dashboard/activity?tenant_id=${tenantId}`,
    fetcher,
    { refreshInterval: 10_000 },
  )

  const activities: Activity[] = data?.activities ?? []

  return (
    <div
      className="flex flex-col h-full bg-[var(--color-saul-bg-900)] border-l border-[var(--color-saul-border)]"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-saul-border)] shrink-0">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
        </span>
        <h2 className="text-[12px] font-semibold tracking-[0.06em] uppercase text-[var(--color-saul-text-secondary)]">
          Live Activity
        </h2>
      </div>

      {/* Feed list */}
      <div className="flex-1 overflow-y-auto" style={{ maxHeight: 400 }}>
        {isLoading && activities.length === 0 ? (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-12 rounded-[6px] bg-[var(--color-saul-overlay-low)] animate-pulse"
              />
            ))}
          </div>
        ) : activities.length === 0 ? (
          <p className="text-[12px] text-[var(--color-saul-text-secondary)] text-center px-4 py-8">
            No recent activity
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--color-saul-border-soft)]">
            <AnimatePresence initial={false}>
              {activities.slice(0, 10).map((item) => {
                const Icon = ACTIVITY_ICONS[item.activity_type] ?? Lightning
                const iconColor = ACTIVITY_COLORS[item.activity_type] ?? 'text-[var(--color-saul-text-secondary)]'

                return (
                  <motion.li
                    key={item.id}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-[var(--color-saul-overlay-soft)] transition-colors duration-150"
                  >
                    {/* Icon */}
                    <span className={`mt-0.5 shrink-0 ${iconColor}`}>
                      <Icon size={14} weight="fill" />
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-[var(--color-saul-text-primary)] truncate leading-tight">
                        {item.company_name}
                      </p>
                      <p className="text-[11px] text-[var(--color-saul-text-secondary)] leading-tight mt-0.5">
                        {item.human_label}
                        {item.activity_type === 'score_changed' && item.score != null
                          ? ` to ${item.score}`
                          : ''}
                      </p>
                    </div>

                    {/* Timestamp */}
                    <span className="shrink-0 text-[10px] text-[var(--color-saul-text-secondary)] opacity-60 mt-0.5 whitespace-nowrap">
                      {formatRelative(item.created_at)}
                    </span>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  )
}
