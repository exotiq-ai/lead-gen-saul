'use client'

import { motion } from 'framer-motion'
import {
  ChatCircle,
  PhoneCall,
  EnvelopeSimple,
  ChartBar,
  MagnifyingGlass,
  CheckCircle,
  ArrowsClockwise,
} from '@phosphor-icons/react'

import { formatRelative, formatDate } from '@/lib/utils/formatters'
import type { LeadActivity } from '@/types/lead'
import type { ScoringHistoryRecord } from '@/app/dashboard/leads/[id]/page'

// ─── Activity type helpers ────────────────────────────────────────────────────

const ACTIVITY_LABELS: Record<string, string> = {
  dm_sent:        'DM Sent',
  dm_opened:      'DM Opened',
  dm_replied:     'DM Replied',
  call_made:      'Call Made',
  call_answered:  'Call Answered',
  score_changed:  'Score Updated',
  enriched:       'Lead Enriched',
  form_submitted: 'Form Submitted',
}

function ActivityIcon({ type }: { type: string }) {
  const iconClass = 'w-4 h-4'
  const map: Record<string, React.ReactNode> = {
    dm_sent:        <EnvelopeSimple className={iconClass} />,
    dm_opened:      <EnvelopeSimple className={iconClass} />,
    dm_replied:     <ChatCircle    className={iconClass} />,
    call_made:      <PhoneCall     className={iconClass} />,
    call_answered:  <PhoneCall     className={iconClass} />,
    score_changed:  <ChartBar      className={iconClass} />,
    enriched:       <MagnifyingGlass className={iconClass} />,
    form_submitted: <CheckCircle   className={iconClass} />,
  }
  return <>{map[type] ?? <ArrowsClockwise className={iconClass} />}</>
}

function activityColor(type: string): string {
  if (type.startsWith('dm_'))    return '#00D4AA'
  if (type.startsWith('call_'))  return '#3B82F6'
  if (type === 'score_changed')  return '#FFAE42'
  if (type === 'enriched')       return '#A855F7'
  return '#8B95A8'
}

// ─── Activity Timeline ────────────────────────────────────────────────────────

export function ActivityTimeline({ activities }: { activities: LeadActivity[] }) {
  if (!activities.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <span className="text-[13px]" style={{ color: 'var(--color-saul-text-secondary)' }}>
          No activity recorded yet
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0">
      {activities.map((activity, i) => {
        const color = activityColor(activity.type)
        const label = ACTIVITY_LABELS[activity.type] ?? activity.type.replace(/_/g, ' ')

        return (
          <motion.div
            key={activity.id}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: i * 0.05, ease: 'easeOut' }}
            className="flex gap-3 pb-5 relative"
          >
            {/* Vertical line */}
            {i < activities.length - 1 && (
              <div
                className="absolute left-[15px] top-7 bottom-0 w-px"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              />
            )}

            {/* Icon */}
            <div
              className="flex items-center justify-center w-8 h-8 rounded-full shrink-0 mt-0.5"
              style={{
                background: `${color}15`,
                border: `1px solid ${color}30`,
                color,
              }}
            >
              <ActivityIcon type={activity.type} />
            </div>

            {/* Content */}
            <div className="flex-1 flex items-start justify-between gap-4 min-w-0">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span
                  className="text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color }}
                >
                  {label}
                </span>
                <p className="text-[13px] leading-snug" style={{ color: 'var(--color-saul-text-primary)' }}>
                  {activity.summary}
                </p>
              </div>
              <span
                className="text-[11px] shrink-0 mt-0.5"
                style={{ color: 'var(--color-saul-text-tertiary)', fontFamily: 'var(--font-mono)' }}
              >
                {formatRelative(activity.created_at)}
              </span>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

// ─── Scoring Timeline ─────────────────────────────────────────────────────────

export function ScoringTimeline({ history }: { history: ScoringHistoryRecord[] }) {
  if (!history.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <span className="text-[13px]" style={{ color: 'var(--color-saul-text-secondary)' }}>
          No scoring history yet
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0">
      {history.map((rec, i) => {
        const increased = rec.old_score != null && rec.new_score > rec.old_score
        const decreased = rec.old_score != null && rec.new_score < rec.old_score
        const color = increased ? '#00D4AA' : decreased ? '#FF4757' : '#8B95A8'

        return (
          <motion.div
            key={rec.id}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: i * 0.05, ease: 'easeOut' }}
            className="flex gap-3 pb-5 relative"
          >
            {i < history.length - 1 && (
              <div
                className="absolute left-[15px] top-7 bottom-0 w-px"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              />
            )}

            {/* Dot */}
            <div
              className="flex items-center justify-center w-8 h-8 rounded-full shrink-0 mt-0.5"
              style={{
                background: `${color}15`,
                border: `1px solid ${color}30`,
              }}
            >
              <ChartBar size={14} style={{ color }} />
            </div>

            <div className="flex-1 flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  {rec.old_score != null && (
                    <>
                      <span
                        className="text-base font-bold tabular-nums"
                        style={{ color: 'var(--color-saul-text-secondary)', fontFamily: 'var(--font-mono)' }}
                      >
                        {rec.old_score}
                      </span>
                      <span style={{ color: 'var(--color-saul-text-tertiary)' }}>→</span>
                    </>
                  )}
                  <span
                    className="text-base font-bold tabular-nums"
                    style={{ color, fontFamily: 'var(--font-mono)' }}
                  >
                    {rec.new_score}
                  </span>
                </div>
                {rec.reason && (
                  <p className="text-[12px] leading-snug" style={{ color: 'var(--color-saul-text-secondary)' }}>
                    {rec.reason}
                  </p>
                )}
                {rec.triggered_by && (
                  <span className="text-[11px]" style={{ color: 'var(--color-saul-text-tertiary)' }}>
                    by {rec.triggered_by}
                  </span>
                )}
              </div>
              <span
                className="text-[11px] shrink-0 mt-0.5"
                style={{ color: 'var(--color-saul-text-tertiary)', fontFamily: 'var(--font-mono)' }}
              >
                {formatDate(rec.created_at)}
              </span>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
