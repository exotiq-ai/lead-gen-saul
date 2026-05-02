'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { UserPlus, Flag } from '@phosphor-icons/react'

import { Badge } from '@/components/ui/Badge'
import { formatRelative } from '@/lib/utils/formatters'
import type { Lead } from '@/types/lead'

// ─── Status / stage badge variant ────────────────────────────────────────────

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'default' {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
    converted: 'success',
    qualified: 'success',
    engaged:   'info',
    outreach:  'info',
    scored:    'default',
    enriching: 'warning',
    new:       'default',
    lost:      'danger',
    disqualified: 'danger',
  }
  return map[status] ?? 'default'
}

// ─── Header ───────────────────────────────────────────────────────────────────

interface LeadHeaderProps {
  lead: Lead
  stageName: string | null
  isAssignedToGregory: boolean
}

export function LeadHeader({ lead, stageName, isAssignedToGregory }: LeadHeaderProps) {
  const [showFlagMenu, setShowFlagMenu] = useState(false)

  return (
    <div
      className="rounded-[8px] border p-5"
      style={{
        background: 'var(--color-saul-bg-700)',
        borderColor: 'var(--color-saul-border)',
      }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-2">
          <h2
            className="text-xl font-bold leading-tight"
            style={{ color: 'var(--color-saul-text-primary)' }}
          >
            {lead.full_name ?? [lead.first_name, lead.last_name].filter(Boolean).join(' ') ?? 'Unknown'}
            {lead.company_name && (
              <span className="ml-2 text-base font-normal" style={{ color: 'var(--color-saul-text-secondary)' }}>
                @ {lead.company_name}
              </span>
            )}
          </h2>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={statusVariant(lead.status)}>
              {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
            </Badge>
            {stageName && (
              <Badge variant="default">{stageName}</Badge>
            )}
            {lead.score != null && (
              <Badge variant="score" score={lead.score} />
            )}
            {lead.last_activity_at && (
              <span className="text-[12px]" style={{ color: 'var(--color-saul-text-secondary)' }}>
                Last active {formatRelative(lead.last_activity_at)}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {!isAssignedToGregory && (
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-sm font-medium transition-colors duration-150 cursor-pointer"
              style={{
                background: 'color-mix(in srgb, var(--color-saul-cyan) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-saul-cyan) 25%, transparent)',
                color: 'var(--color-saul-cyan)',
              }}
            >
              <UserPlus size={14} />
              Assign to Gregory
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowFlagMenu(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-sm font-medium transition-colors duration-150 cursor-pointer"
              style={{
                background: 'color-mix(in srgb, var(--color-saul-danger) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-saul-danger) 20%, transparent)',
                color: 'var(--color-saul-danger)',
              }}
            >
              <Flag size={14} />
              Flag Lead
            </button>
            <AnimatePresence>
              {showFlagMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0,  scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 z-50 rounded-[8px] py-1 min-w-44"
                  style={{
                    background: 'var(--color-saul-bg-600)',
                    border: '1px solid var(--color-saul-border-strong)',
                    boxShadow: '0 8px 32px var(--color-saul-shadow)',
                  }}
                  onMouseLeave={() => setShowFlagMenu(false)}
                >
                  {['Competitor', 'Bad Data', 'Wrong ICP', 'Stale 90d', 'Negative Reply'].map(flag => (
                    <button
                      key={flag}
                      className="w-full text-left px-3 py-2 text-[13px] transition-colors duration-100 cursor-pointer"
                      style={{ color: 'var(--color-saul-text-primary)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-saul-overlay-low)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      onClick={() => setShowFlagMenu(false)}
                    >
                      {flag}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
