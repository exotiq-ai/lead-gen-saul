'use client'

import { motion, type Easing } from 'framer-motion'
import { ArrowRight } from '@phosphor-icons/react'
import { Tooltip } from '@/components/ui/Tooltip'
import { Badge } from '@/components/ui/Badge'
import { LeadScoreCard } from './LeadScoreCard'
import { RedFlagBadge } from './RedFlagBadge'
import { formatRelative } from '@/lib/utils/formatters'
import type { Lead, LeadStatus, LeadSource } from '@/types/lead'

interface LeadRowProps {
  lead: Lead
  index: number
  onClick: () => void
  onScoreClick?: (score: number) => void
  onStatusClick?: (status: LeadStatus) => void
}

// Stage display config
const STATUS_CONFIG: Record<
  LeadStatus,
  { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' }
> = {
  new: { label: 'New', variant: 'default' },
  enriching: { label: 'Enriching', variant: 'default' },
  scored: { label: 'Scored', variant: 'info' },
  outreach: { label: 'Contacted', variant: 'info' },
  engaged: { label: 'Engaged', variant: 'warning' },
  qualified: { label: 'Qualified', variant: 'success' },
  converted: { label: 'Won', variant: 'success' },
  lost: { label: 'Lost', variant: 'danger' },
  disqualified: { label: 'Disqualified', variant: 'danger' },
}

// Source display config
const SOURCE_CONFIG: Record<
  string,
  { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' }
> = {
  outbound: { label: 'Apollo', variant: 'info' },
  api: { label: 'Apollo', variant: 'info' },
  paid: { label: 'Paid', variant: 'success' },
  referral: { label: 'Referral', variant: 'warning' },
  organic: { label: 'Organic', variant: 'default' },
}

function getSourceConfig(source: LeadSource | null) {
  if (!source) return { label: 'Unknown', variant: 'default' as const }
  // Check if Instagram from metadata (passed via source string override)
  return SOURCE_CONFIG[source] ?? { label: source, variant: 'default' as const }
}

function getLastActiveColor(dateStr: string | null): string {
  if (!dateStr) return 'text-[var(--color-saul-text-tertiary)]'
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = diff / (1000 * 60 * 60 * 24)
  if (days < 7) return 'text-[var(--color-saul-success)]'
  if (days <= 30) return 'text-[var(--color-saul-warning)]'
  return 'text-[var(--color-saul-danger)]'
}

const EASE_OUT: Easing = 'easeOut'

const rowVariants = {
  hidden: { opacity: 0, y: 4 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.025,
      duration: 0.2,
      ease: EASE_OUT,
    },
  }),
}

export function LeadRow({ lead, index, onClick, onScoreClick, onStatusClick }: LeadRowProps) {
  const displayName = lead.company_name || lead.full_name || '—'
  const location = [lead.city, lead.state].filter(Boolean).join(', ')
  const statusCfg = STATUS_CONFIG[lead.status] ?? { label: lead.status, variant: 'default' as const }
  const sourceCfg = getSourceConfig(lead.source)
  const lastActiveColor = getLastActiveColor(lead.last_activity_at)
  const industry = (lead.metadata?.industry as string) ?? null
  const fleetTier = (lead.metadata?.fleet_tier as string) ?? null

  return (
    <motion.tr
      custom={index}
      variants={rowVariants}
      initial="hidden"
      animate="visible"
      onClick={onClick}
      className="group cursor-pointer transition-colors duration-150 hover:bg-[rgba(28,36,57,0.5)] border-b border-[rgba(255,255,255,0.04)] last:border-0"
    >
      {/* Company */}
      <td className="px-4 py-2.5 max-w-[200px]">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold text-[var(--color-saul-text-primary)] truncate leading-tight">
            {displayName}
          </span>
          {location && (
            <span className="text-[11px] text-[var(--color-saul-text-secondary)] truncate leading-tight">
              {location}
            </span>
          )}
        </div>
      </td>

      {/* Industry / Fleet */}
      <td className="hidden md:table-cell px-4 py-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] text-[var(--color-saul-text-primary)] truncate leading-tight">
            {industry ?? '—'}
          </span>
          {fleetTier && (
            <span className="text-[11px] text-[var(--color-saul-text-secondary)] truncate leading-tight">
              {fleetTier}
            </span>
          )}
        </div>
      </td>

      {/* Source */}
      <td className="hidden md:table-cell px-4 py-2.5">
        <Badge variant={sourceCfg.variant}>{sourceCfg.label}</Badge>
      </td>

      {/* Score */}
      <td className="px-4 py-2.5">
        <div
          onClick={(e) => {
            e.stopPropagation()
            if (lead.score != null) onScoreClick?.(lead.score)
          }}
          className="inline-block cursor-pointer transition-all duration-150 hover:scale-105"
        >
          <LeadScoreCard score={lead.score ?? 0} />
        </div>
      </td>

      {/* Stage */}
      <td className="px-4 py-2.5">
        <div
          onClick={(e) => {
            e.stopPropagation()
            onStatusClick?.(lead.status)
          }}
          className="inline-block cursor-pointer transition-all duration-150 hover:opacity-80"
        >
          <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
        </div>
      </td>

      {/* Assigned */}
      <td className="hidden md:table-cell px-4 py-2.5">
        {lead.assigned_to === 'gregory' ? (
          <Tooltip content="Gregory Ringler" position="top">
            <span
              className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold leading-none cursor-default select-none"
              style={{
                background: 'rgba(0,212,170,0.15)',
                border: '1px solid rgba(0,212,170,0.3)',
                color: 'var(--color-saul-cyan)',
              }}
            >
              G
            </span>
          </Tooltip>
        ) : lead.assigned_to === 'team' ? (
          <Tooltip content="Team" position="top">
            <span
              className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold leading-none cursor-default select-none"
              style={{
                background: 'rgba(139,149,168,0.12)',
                border: '1px solid rgba(139,149,168,0.2)',
                color: 'var(--color-saul-text-secondary)',
              }}
            >
              T
            </span>
          </Tooltip>
        ) : (
          <span className="text-[var(--color-saul-text-tertiary)] text-[11px]">—</span>
        )}
      </td>

      {/* Red Flags */}
      <td className="hidden md:table-cell px-4 py-2.5">
        <RedFlagBadge flags={lead.red_flags} />
      </td>

      {/* Last Active */}
      <td className="hidden md:table-cell px-4 py-2.5 whitespace-nowrap">
        <span className={['text-[11px] font-medium tabular-nums', lastActiveColor].join(' ')}>
          {lead.last_activity_at ? formatRelative(lead.last_activity_at) : '—'}
        </span>
      </td>

      {/* Arrow */}
      <td className="px-3 py-2.5 w-8">
        <ArrowRight
          size={14}
          className="text-[var(--color-saul-text-tertiary)] transition-all duration-150 group-hover:text-[var(--color-saul-cyan)] group-hover:translate-x-0.5"
        />
      </td>
    </motion.tr>
  )
}
