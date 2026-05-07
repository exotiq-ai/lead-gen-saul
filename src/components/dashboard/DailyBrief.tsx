'use client'

import { useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  EnvelopeSimple,
  Phone,
  ChatCircle,
  ArrowsClockwise,
  Star,
  Lightning,
  TrendUp,
  Hourglass,
  Warning,
  PaperPlaneTilt,
  UserPlus,
  ChartBar,
  ChatDots,
} from '@phosphor-icons/react'
import useSWR from 'swr'
import { formatRelative } from '@/lib/utils/formatters'
import { useTenantId } from '@/lib/hooks/useTenant'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface PriorityAction {
  type: string
  count: number
  label: string
}

interface TodayStats {
  outreach_sent: number
  new_leads: number
  leads_scored: number
  replies_received: number
}

interface Outlier {
  lead_id: string
  company_name: string
  reason: string
  type: string
}

interface Activity {
  id: string
  company_name: string
  score: number | null
  activity_type: string
  human_label: string
  created_at: string
}

interface BriefData {
  priority_actions: PriorityAction[]
  today_stats: TodayStats
  outliers: Outlier[]
  recent_activity: Activity[]
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

const PRIORITY_BADGE_STYLES: Record<string, string> = {
  dm_replied: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  pending_approval: 'bg-[var(--color-saul-warning)]/15 text-[var(--color-saul-warning)] border-[var(--color-saul-warning)]/25',
  red_flags_today: 'bg-[var(--color-saul-caution,var(--color-saul-danger))]/15 text-[var(--color-saul-caution,var(--color-saul-danger))] border-[var(--color-saul-caution,var(--color-saul-danger))]/25',
}

interface DailyBriefProps {
  isOpen: boolean
  onClose: () => void
}

export function DailyBrief({ isOpen, onClose }: DailyBriefProps) {
  const tenantId = useTenantId()
  const { data, isLoading } = useSWR<BriefData>(
    isOpen ? `/api/dashboard/brief?tenant_id=${tenantId}` : null,
    fetcher,
    { refreshInterval: 30_000 },
  )

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, handleEscape])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[360px] bg-[var(--color-saul-bg-900)] border-l border-[var(--color-saul-border)] shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-saul-border-soft)] shrink-0">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-saul-cyan)] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-saul-cyan)]" />
                </span>
                <h2 className="text-[14px] font-semibold text-[var(--color-saul-text-primary)]">
                  Daily Brief
                </h2>
              </div>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-7 h-7 rounded-[6px] hover:bg-[var(--color-saul-overlay-strong)] transition-colors text-[var(--color-saul-text-secondary)] hover:text-[var(--color-saul-text-primary)]"
                aria-label="Close daily brief"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex flex-col gap-3 p-5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-16 rounded-[8px] bg-[var(--color-saul-overlay-low)] animate-pulse"
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-5 p-5">
                  {/* Priority Actions */}
                  <Section title="Priority Actions">
                    <div className="flex flex-col gap-2">
                      {(data?.priority_actions ?? []).map((action) => (
                        <div
                          key={action.type}
                          className="flex items-center justify-between py-2 px-3 rounded-[6px] bg-[var(--color-saul-overlay-soft)] border border-[var(--color-saul-border-soft)]"
                        >
                          <span className="text-[12px] text-[var(--color-saul-text-secondary)]">
                            {action.label}
                          </span>
                          <span
                            className={`inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 text-[11px] font-bold rounded-full border ${PRIORITY_BADGE_STYLES[action.type] ?? 'bg-[var(--color-saul-overlay)] text-[var(--color-saul-text-secondary)] border-[var(--color-saul-border)]'}`}
                          >
                            {action.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Section>

                  {/* Today's Numbers */}
                  <Section title="Today's Numbers">
                    <div className="grid grid-cols-2 gap-2">
                      <StatCell
                        icon={PaperPlaneTilt}
                        label="Outreach sent"
                        value={data?.today_stats.outreach_sent ?? 0}
                      />
                      <StatCell
                        icon={UserPlus}
                        label="New leads"
                        value={data?.today_stats.new_leads ?? 0}
                      />
                      <StatCell
                        icon={ChartBar}
                        label="Leads scored"
                        value={data?.today_stats.leads_scored ?? 0}
                      />
                      <StatCell
                        icon={ChatDots}
                        label="Replies"
                        value={data?.today_stats.replies_received ?? 0}
                      />
                    </div>
                  </Section>

                  {/* Outliers */}
                  {(data?.outliers ?? []).length > 0 && (
                    <Section title="Outliers">
                      <div className="flex flex-col gap-1.5">
                        {(data?.outliers ?? []).map((outlier) => (
                          <div
                            key={outlier.lead_id}
                            className="flex items-start gap-2.5 py-2 px-3 rounded-[6px] bg-[var(--color-saul-overlay-soft)] border border-[var(--color-saul-border-soft)]"
                          >
                            <span className="mt-0.5 shrink-0">
                              {outlier.type === 'score_jump' ? (
                                <TrendUp size={14} weight="fill" className="text-[var(--color-saul-cyan)]" />
                              ) : (
                                <Hourglass size={14} weight="fill" className="text-[var(--color-saul-warning)]" />
                              )}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-semibold text-[var(--color-saul-text-primary)] truncate leading-tight">
                                {outlier.company_name}
                              </p>
                              <p className="text-[11px] text-[var(--color-saul-text-secondary)] leading-tight mt-0.5">
                                {outlier.reason}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* Recent Activity */}
                  <Section title="Recent Activity">
                    {(data?.recent_activity ?? []).length === 0 ? (
                      <p className="text-[12px] text-[var(--color-saul-text-secondary)] text-center py-4">
                        No recent activity
                      </p>
                    ) : (
                      <ul className="flex flex-col divide-y divide-[var(--color-saul-border-soft)]">
                        {(data?.recent_activity ?? []).slice(0, 10).map((item) => {
                          const Icon = ACTIVITY_ICONS[item.activity_type] ?? Lightning
                          const iconColor = ACTIVITY_COLORS[item.activity_type] ?? 'text-[var(--color-saul-text-secondary)]'

                          return (
                            <li
                              key={item.id}
                              className="flex items-start gap-2.5 py-2.5 first:pt-0"
                            >
                              <span className={`mt-0.5 shrink-0 ${iconColor}`}>
                                <Icon size={14} weight="fill" />
                              </span>
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
                              <span className="shrink-0 text-[10px] text-[var(--color-saul-text-secondary)] opacity-60 mt-0.5 whitespace-nowrap">
                                {formatRelative(item.created_at)}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </Section>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--color-saul-text-secondary)]">
        {title}
      </h3>
      {children}
    </div>
  )
}

function StatCell({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2.5 py-2.5 px-3 rounded-[6px] bg-[var(--color-saul-overlay-soft)] border border-[var(--color-saul-border-soft)]">
      <Icon size={14} weight="duotone" className="text-[var(--color-saul-text-secondary)] shrink-0" />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[15px] font-bold text-[var(--color-saul-text-primary)] font-mono leading-none tabular-nums">
          {value}
        </span>
        <span className="text-[10px] text-[var(--color-saul-text-secondary)] leading-none truncate">
          {label}
        </span>
      </div>
    </div>
  )
}
