'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, type Transition } from 'framer-motion'
import {
  Warning,
  Star,
  Plus,
  CaretRight,
  ArrowRight,
  Funnel,
  ArrowsClockwise,
} from '@phosphor-icons/react'

import { Badge } from '@/components/ui/Badge'
import { formatRelative, formatNumber, formatPercent } from '@/lib/utils/formatters'
import type {
  PipelineDetailResponse,
  PipelineStageDetail,
  PipelineTopLead,
} from '@/app/api/dashboard/pipeline-detail/route'

// ─── Re-export type alias for convenience ────────────────────────────────────

type PipelinePageData = PipelineDetailResponse

// ─── Helpers ─────────────────────────────────────────────────────────────────

function redFlagged(flags: unknown): boolean {
  if (!flags) return false
  if (Array.isArray(flags)) return flags.length > 0
  if (typeof flags === 'string') return flags !== '[]' && flags.length > 2
  return false
}

function activityAgeClass(dt: string | null): string {
  if (!dt) return 'text-[var(--color-saul-text-tertiary)]'
  const days = (Date.now() - new Date(dt).getTime()) / 86_400_000
  if (days < 3) return 'text-[var(--color-saul-success)]'
  if (days < 14) return 'text-[var(--color-saul-warning)]'
  return 'text-[var(--color-saul-danger)]'
}

function stageAccentColor(stage: PipelineStageDetail): string {
  if (stage.color) return stage.color
  if (stage.is_terminal) return '#6b7280'
  return '#00D4AA'
}

function displayName(lead: PipelineTopLead): string {
  if (lead.company_name) return lead.company_name
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ')
  return name || 'Unknown'
}

function displayLocation(lead: PipelineTopLead): string {
  return [lead.city, lead.state].filter(Boolean).join(', ')
}

// ─── Animation variants ───────────────────────────────────────────────────────

const columnVariants = {
  hidden: { opacity: 0, x: 24 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
    },
  }),
}

const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.03,
      duration: 0.25,
      ease: 'easeOut',
    } as Transition,
  }),
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SummaryBar({ data }: { data: PipelinePageData }) {
  const kpis = [
    {
      label: 'Total Leads',
      value: formatNumber(data.total_leads),
      sub: `across ${data.stages.length} stages`,
      accent: false,
    },
    {
      label: 'Conversion Rate',
      value: formatPercent(data.conversion_rate, 1),
      sub: `${formatNumber(data.total_converted)} converted`,
      accent: data.conversion_rate > 10,
    },
    {
      label: "Gregory's Leads",
      value: formatNumber(data.total_gregory),
      sub: 'assigned to gregory',
      accent: false,
    },
    {
      label: 'Added This Week',
      value: formatNumber(data.added_this_week),
      sub: 'new entries',
      accent: false,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="rounded-[8px] border border-[rgba(255,255,255,0.06)] bg-[var(--color-saul-bg-700)] p-4"
        >
          <p className="text-[11px] text-[var(--color-saul-text-secondary)] uppercase tracking-wider font-medium leading-none">
            {kpi.label}
          </p>
          <p
            className={[
              'text-[26px] font-mono font-bold tabular-nums leading-none mt-2.5',
              kpi.accent
                ? 'text-[var(--color-saul-cyan)]'
                : 'text-[var(--color-saul-text-primary)]',
            ].join(' ')}
          >
            {kpi.value}
          </p>
          <p className="text-[11px] text-[var(--color-saul-text-tertiary)] mt-1.5 leading-none">
            {kpi.sub}
          </p>
        </div>
      ))}
    </div>
  )
}

function StageStats({ stage }: { stage: PipelineStageDetail }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-[rgba(255,255,255,0.05)] bg-[rgba(0,0,0,0.15)]">
      {/* Gregory */}
      <div className="flex items-center gap-1" title="Assigned to Gregory">
        <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-[rgba(0,212,170,0.12)] border border-[rgba(0,212,170,0.25)] text-[9px] font-bold text-[var(--color-saul-cyan)] leading-none select-none">
          G
        </span>
        <span className="text-[11px] font-mono tabular-nums text-[var(--color-saul-text-secondary)]">
          {stage.gregory_count}
        </span>
      </div>

      {/* High score (80+) */}
      <div className="flex items-center gap-1" title="Score 80+">
        <Star size={11} weight="fill" className="text-[var(--color-saul-cyan)] flex-shrink-0" />
        <span className="text-[11px] font-mono tabular-nums text-[var(--color-saul-text-secondary)]">
          {stage.high_score_count}
        </span>
      </div>

      {/* Flagged */}
      <div className="flex items-center gap-1" title="Red flagged">
        <Warning
          size={11}
          weight="fill"
          className="text-[var(--color-saul-danger)] flex-shrink-0"
        />
        <span className="text-[11px] font-mono tabular-nums text-[var(--color-saul-text-secondary)]">
          {stage.flagged_count}
        </span>
      </div>

      {/* Active this week */}
      <div className="flex items-center gap-1" title="Active this week">
        <span className="w-[7px] h-[7px] rounded-full bg-[var(--color-saul-success)] flex-shrink-0" />
        <span className="text-[11px] font-mono tabular-nums text-[var(--color-saul-text-secondary)]">
          {stage.active_this_week}
        </span>
      </div>
    </div>
  )
}

function LeadPreviewCard({
  lead,
  index,
}: {
  lead: PipelineTopLead
  index: number
}) {
  const router = useRouter()
  const isFlagged = redFlagged(lead.red_flags)
  const location = displayLocation(lead)
  const ageClass = activityAgeClass(lead.last_activity_at)

  return (
    <motion.div
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ scale: 1.02 }}
      onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
      className="relative p-2.5 rounded-[6px] border border-[rgba(255,255,255,0.05)] bg-[rgba(0,0,0,0.18)] cursor-pointer transition-[border-color,box-shadow] duration-150 hover:border-[rgba(0,212,170,0.3)] hover:shadow-[0_0_0_1px_rgba(0,212,170,0.08)]"
    >
      {/* Company + score row */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="text-[12px] font-semibold text-[var(--color-saul-text-primary)] truncate leading-tight">
              {displayName(lead)}
            </p>
            {isFlagged && (
              <Warning
                size={10}
                weight="fill"
                className="text-[var(--color-saul-danger)] flex-shrink-0"
              />
            )}
          </div>
          {location && (
            <p className="text-[10px] text-[var(--color-saul-text-tertiary)] mt-0.5 truncate leading-tight">
              {location}
            </p>
          )}
        </div>
        {lead.score != null && (
          <Badge variant="score" score={lead.score} className="flex-shrink-0 mt-0.5" />
        )}
      </div>

      {/* Last active */}
      {lead.last_activity_at && (
        <p className={`text-[10px] font-mono tabular-nums mt-1.5 leading-none ${ageClass}`}>
          {formatRelative(lead.last_activity_at)}
        </p>
      )}
    </motion.div>
  )
}

function EmptyStageColumn({
  stage,
  color,
}: {
  stage: PipelineStageDetail
  color: string
}) {
  return (
    <div className="flex flex-col rounded-[8px] border-2 border-dashed border-[rgba(255,255,255,0.07)] overflow-hidden min-h-[220px]">
      {/* Dim color bar */}
      <div style={{ height: 3, background: `${color}40` }} />

      {/* Header */}
      <div className="px-3 py-2.5 border-b border-dashed border-[rgba(255,255,255,0.05)]">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-[var(--color-saul-text-tertiary)] truncate">
            {stage.name}
          </h3>
          <span className="text-[11px] font-mono text-[var(--color-saul-text-tertiary)]">0</span>
        </div>
      </div>

      {/* Empty body */}
      <div className="flex-1 flex flex-col items-center justify-center gap-2.5 p-5">
        <div className="w-9 h-9 rounded-full border-2 border-dashed border-[rgba(255,255,255,0.1)] flex items-center justify-center">
          <Plus size={16} className="text-[var(--color-saul-text-tertiary)]" />
        </div>
        <p className="text-[11px] text-[var(--color-saul-text-tertiary)] text-center leading-snug">
          No leads in
          <br />
          {stage.name}
        </p>
      </div>
    </div>
  )
}

function StageColumn({
  stage,
  colIndex,
}: {
  stage: PipelineStageDetail
  colIndex: number
}) {
  const color = stageAccentColor(stage)

  if (stage.lead_count === 0) {
    return <EmptyStageColumn stage={stage} color={color} />
  }

  return (
    <div className="flex flex-col rounded-[8px] border border-[rgba(255,255,255,0.06)] bg-[var(--color-saul-bg-700)] overflow-hidden">
      {/* Color accent bar */}
      <div style={{ height: 3, background: color, flexShrink: 0 }} />

      {/* Header */}
      <div className="px-3 pt-2.5 pb-2 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-[var(--color-saul-text-primary)] truncate">
            {stage.name}
          </h3>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Lead count badge with stage color */}
            <span
              className="inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-mono font-bold border rounded-[4px] tabular-nums leading-none"
              style={{
                color,
                borderColor: `${color}40`,
                background: `${color}18`,
              }}
            >
              {stage.lead_count}
            </span>
            {/* Avg score */}
            {stage.avg_score != null && (
              <span className="text-[11px] font-mono text-[var(--color-saul-text-tertiary)] tabular-nums">
                ~{stage.avg_score}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <StageStats stage={stage} />

      {/* Lead preview cards */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 max-h-[400px]">
        {stage.top_leads.map((lead, i) => (
          <LeadPreviewCard key={lead.id} lead={lead} index={i} />
        ))}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-[rgba(255,255,255,0.05)] px-3 py-2">
        <Link
          href={`/dashboard/leads?stage_id=${stage.id}`}
          className="flex items-center gap-1 text-[11px] text-[var(--color-saul-text-secondary)] hover:text-[var(--color-saul-cyan)] transition-colors duration-150 group"
        >
          <span>View all {stage.lead_count} leads</span>
          <CaretRight
            size={10}
            className="group-hover:translate-x-0.5 transition-transform duration-150"
          />
        </Link>
      </div>
    </div>
  )
}

function DropoffConnector({
  fromCount,
  toCount,
}: {
  fromCount: number
  toCount: number
}) {
  const dropPct =
    fromCount > 0 ? Math.max(0, Math.round((1 - toCount / fromCount) * 100)) : 0
  const isHigh = dropPct >= 50

  return (
    <div
      className="flex flex-col items-center justify-start flex-shrink-0 pt-[48px] gap-1"
      aria-hidden="true"
      style={{ width: 40 }}
    >
      <ArrowRight size={13} className="text-[rgba(255,255,255,0.15)]" />
      <span
        className={[
          'text-[9px] font-mono tabular-nums leading-none',
          isHigh
            ? 'text-[var(--color-saul-danger)]'
            : 'text-[var(--color-saul-text-tertiary)]',
        ].join(' ')}
      >
        ↓{dropPct}%
      </span>
    </div>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

interface PipelinePageClientProps {
  data: PipelinePageData
}

export function PipelinePageClient({ data }: PipelinePageClientProps) {
  const { stages } = data
  const activeStages = stages.filter((s) => !s.is_terminal)

  if (!stages.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <span className="flex items-center justify-center w-14 h-14 rounded-[10px] bg-[var(--color-saul-bg-700)] border border-[rgba(255,255,255,0.06)]">
          <Funnel size={28} weight="regular" className="text-[var(--color-saul-cyan)]" />
        </span>
        <div className="text-center">
          <h2 className="text-[18px] font-semibold text-[var(--color-saul-text-primary)] font-mono">
            No pipeline stages configured
          </h2>
          <p className="text-[13px] text-[var(--color-saul-text-secondary)] mt-1">
            Set up pipeline stages to visualize your funnel
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 p-6 min-h-0">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-[var(--color-saul-text-primary)] font-mono tracking-tight leading-none">
            Pipeline
          </h1>
          <p className="text-[13px] text-[var(--color-saul-text-secondary)] mt-1 leading-none">
            {stages.length} stage{stages.length !== 1 ? 's' : ''} · {formatNumber(data.total_leads)} total lead{data.total_leads !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] border border-[rgba(0,212,170,0.2)] bg-[rgba(0,212,170,0.06)] text-[11px] font-medium text-[var(--color-saul-cyan)]">
            <ArrowsClockwise size={11} />
            Live
          </span>
        </div>
      </div>

      {/* Summary KPI bar */}
      <SummaryBar data={data} />

      {/* Stage columns — horizontally scrollable */}
      <div
        className="flex flex-row items-start overflow-x-auto pb-4 gap-0"
        style={{ scrollbarColor: 'rgba(0,212,170,0.2) transparent' }}
      >
        {stages.flatMap((stage, i) => {
          const showConnector =
            i < stages.length - 1 &&
            !stage.is_terminal &&
            !stages[i + 1].is_terminal

          const elements: React.ReactNode[] = [
            <motion.div
              key={stage.id}
              custom={i}
              variants={columnVariants}
              initial="hidden"
              animate="visible"
              style={{ width: 272, minWidth: 272, flexShrink: 0 }}
            >
              <StageColumn stage={stage} colIndex={i} />
            </motion.div>,
          ]

          if (showConnector) {
            elements.push(
              <DropoffConnector
                key={`connector-${i}`}
                fromCount={stage.lead_count}
                toCount={stages[i + 1].lead_count}
              />
            )
          }

          return elements
        })}
      </div>

      {/* Active-stages funnel hint */}
      {activeStages.length > 1 && (
        <p className="text-[11px] text-[var(--color-saul-text-tertiary)] font-mono">
          ↓ drop-off shown between active stages · terminal stages (won / lost) excluded from funnel math
        </p>
      )}
    </div>
  )
}
