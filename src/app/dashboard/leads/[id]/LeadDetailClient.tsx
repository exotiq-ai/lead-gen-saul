'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Envelope,
  Phone,
  Globe,
  LinkedinLogo,
  Warning,
  ChatCircle,
  PhoneCall,
  EnvelopeSimple,
  ChartBar,
  MagnifyingGlass,
  CheckCircle,
  Copy,
  ArrowsClockwise,
  UserPlus,
  Flag,
} from '@phosphor-icons/react'

import { Badge } from '@/components/ui/Badge'
import { formatRelative, formatDate, formatCurrency } from '@/lib/utils/formatters'
import type { Lead, LeadActivity } from '@/types/lead'
import type { EnrichmentRecord, SaulWebEnrichmentData } from '@/types/enrichment'
import type { ScoringHistoryRecord } from './page'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeadDetailClientProps {
  lead: Lead
  activities: LeadActivity[]
  enrichments: EnrichmentRecord[]
  stageName: string | null
  scoringHistory: ScoringHistoryRecord[]
}

type Tab = 'activity' | 'enrichment' | 'scoring'

// ─── Tier helpers ─────────────────────────────────────────────────────────────

function getTierInfo(score: number): { tier: number; label: string; color: string } {
  if (score >= 80) return { tier: 5, label: 'Whale',       color: '#00D4AA' }
  if (score >= 60) return { tier: 4, label: 'Powerhouse',  color: '#3B82F6' }
  if (score >= 40) return { tier: 3, label: 'Mid-Market',  color: '#FFAE42' }
  if (score >= 20) return { tier: 2, label: 'Small Fleet', color: '#F97316' }
  return                   { tier: 1, label: 'Prospect',   color: '#FF4757' }
}

function getRingColor(score: number): string {
  if (score >= 80) return '#00D4AA'
  if (score >= 60) return '#3B82F6'
  if (score >= 40) return '#FFAE42'
  return '#FF4757'
}

// ─── SVG Score Ring ───────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const radius = 52
  const cx = 68
  const cy = 68
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (Math.min(score, 100) / 100) * circumference
  const color = getRingColor(score)
  const tier = getTierInfo(score)

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="relative" style={{ width: 136, height: 136 }}>
        <svg width="136" height="136" className="block" style={{ transform: 'rotate(-90deg)' }}>
          {/* Track */}
          <circle
            cx={cx} cy={cy} r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="8"
          />
          {/* Fill */}
          <motion.circle
            cx={cx} cy={cy} r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.2 }}
          />
        </svg>
        {/* Center score */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-4xl font-bold leading-none tabular-nums"
            style={{ color: 'var(--color-saul-text-primary)', fontFamily: 'var(--font-mono)' }}
          >
            {Math.round(score)}
          </span>
          <span className="text-[11px] mt-0.5" style={{ color: 'var(--color-saul-text-secondary)' }}>
            / 100
          </span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span
          className="text-sm font-semibold"
          style={{ color: tier.color, fontFamily: 'var(--font-mono)' }}
        >
          Tier {tier.tier} — {tier.label}
        </span>
      </div>
    </div>
  )
}

// ─── Mini bar ─────────────────────────────────────────────────────────────────

function MiniBar({ label, value, max = 100, color = '#00D4AA' }: {
  label: string
  value: number
  max?: number
  color?: string
}) {
  const pct = Math.min(Math.round((value / max) * 100), 100)
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] w-28 shrink-0" style={{ color: 'var(--color-saul-text-secondary)' }}>
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
        />
      </div>
      <span
        className="text-[11px] w-8 text-right tabular-nums"
        style={{ color: 'var(--color-saul-text-secondary)', fontFamily: 'var(--font-mono)' }}
      >
        {pct}%
      </span>
    </div>
  )
}

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

// ─── Provider helpers ─────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  apollo:   '#3B82F6',
  saul_web: '#00D4AA',
  clearbit: '#A855F7',
  linkedin: '#0A66C2',
  scraper:  '#8B95A8',
}

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

// ─── Main component ───────────────────────────────────────────────────────────

export function LeadDetailClient({
  lead,
  activities,
  enrichments,
  stageName,
  scoringHistory,
}: LeadDetailClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab]   = useState<Tab>('activity')
  const [copied, setCopied]         = useState(false)
  const [showFlagMenu, setShowFlagMenu] = useState(false)

  const score     = lead.score ?? 0
  const tier      = getTierInfo(score)
  const breakdown = lead.score_breakdown
  const flags     = lead.red_flags ?? []

  // Safe-access fields that may exist in DB but not yet in TS type
  const l = lead as Lead & Record<string, unknown>
  const icpFitScore    = (l.icp_fit_score    as number | null) ?? null
  const engagementScore = (l.engagement_score as number | null) ?? null
  const linkedinUrl    = (l.linkedin_url     as string | null)
    ?? (l.linkedin       as string | null) ?? null
  const companyDomain  = (l.company_domain   as string | null)
    ?? (l.website        as string | null) ?? null
  const companySize    = (l.company_size     as string | null) ?? null

  function copyEmail() {
    if (!lead.email) return
    navigator.clipboard.writeText(lead.email)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isAssignedToGregory = lead.assigned_to === 'gregory'

  return (
    <div className="flex flex-col gap-0 min-h-screen" style={{ color: 'var(--color-saul-text-primary)' }}>
      {/* ── Back nav ── */}
      <div className="px-6 pt-4 pb-2">
        <button
          onClick={() => router.push('/dashboard/leads')}
          className="flex items-center gap-1.5 text-sm transition-colors duration-150 cursor-pointer"
          style={{ color: 'var(--color-saul-text-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-saul-text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-saul-text-secondary)')}
        >
          <ArrowLeft size={14} />
          <span>All Leads</span>
        </button>
      </div>

      {/* ── 3-col grid ── */}
      <div className="flex flex-1 gap-0 px-6 pb-8" style={{ alignItems: 'flex-start' }}>

        {/* ══ LEFT PANEL ══════════════════════════════════════════════════════ */}
        <aside
          className="w-72 shrink-0 flex flex-col gap-4 sticky top-6 mr-6"
          style={{ maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}
        >
          {/* Identity card */}
          <div
            className="rounded-[8px] border p-5 flex flex-col gap-3"
            style={{
              background: 'var(--color-saul-bg-700)',
              borderColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex flex-col gap-1">
              <h1
                className="text-lg font-bold leading-tight"
                style={{ color: 'var(--color-saul-text-primary)' }}
              >
                {lead.company_name ?? lead.full_name ?? 'Unknown'}
              </h1>

              {(lead.city || lead.state) && (
                <div className="flex items-center gap-1">
                  <Badge variant="default">
                    {[lead.city, lead.state].filter(Boolean).join(', ')}
                  </Badge>
                </div>
              )}

              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {typeof l.industry === 'string' && l.industry && (
                  <span className="text-[12px]" style={{ color: 'var(--color-saul-text-secondary)' }}>
                    {l.industry}
                  </span>
                )}
                {companySize && (
                  <>
                    {typeof l.industry === 'string' && l.industry && (
                      <span style={{ color: 'var(--color-saul-text-tertiary)' }}>·</span>
                    )}
                    <span className="text-[12px]" style={{ color: 'var(--color-saul-text-secondary)' }}>
                      {companySize} fleet
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Assigned badge */}
            <div>
              {isAssignedToGregory ? (
                <Badge variant="success">Gregory</Badge>
              ) : (
                <Badge variant="default">Team</Badge>
              )}
            </div>
          </div>

          {/* Score ring */}
          <div
            className="rounded-[8px] border p-4"
            style={{
              background: 'var(--color-saul-bg-700)',
              borderColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <ScoreRing score={score} />

            {/* Score breakdown bars */}
            {(icpFitScore !== null || engagementScore !== null || breakdown) && (
              <div className="flex flex-col gap-2.5 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <span
                  className="text-[11px] uppercase tracking-wider font-medium mb-0.5"
                  style={{ color: 'var(--color-saul-text-tertiary)' }}
                >
                  Score Breakdown
                </span>

                {icpFitScore !== null && (
                  <MiniBar label="ICP Fit" value={icpFitScore} color="#00D4AA" />
                )}
                {engagementScore !== null && (
                  <MiniBar label="Engagement" value={engagementScore} color="#3B82F6" />
                )}
                {breakdown && (
                  <>
                    {breakdown.fleet_size > 0 && (
                      <MiniBar label="Fleet Size" value={breakdown.fleet_size} max={30} color="#FFAE42" />
                    )}
                    {breakdown.market_tier > 0 && (
                      <MiniBar label="Market Tier" value={breakdown.market_tier} max={20} color="#A855F7" />
                    )}
                    {breakdown.vehicle_quality > 0 && (
                      <MiniBar label="Vehicle Quality" value={breakdown.vehicle_quality} max={15} color="#06B6D4" />
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Contact Info */}
          <div
            className="rounded-[8px] border p-4 flex flex-col gap-2.5"
            style={{
              background: 'var(--color-saul-bg-700)',
              borderColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <span
              className="text-[11px] uppercase tracking-wider font-medium"
              style={{ color: 'var(--color-saul-text-tertiary)' }}
            >
              Contact
            </span>

            {lead.email && (
              <button
                onClick={copyEmail}
                className="flex items-center gap-2 text-left group cursor-pointer"
              >
                <Envelope size={14} style={{ color: 'var(--color-saul-text-secondary)' }} />
                <span className="text-[12px] truncate flex-1" style={{ color: 'var(--color-saul-text-primary)' }}>
                  {lead.email}
                </span>
                <span
                  className="text-[11px] shrink-0 transition-opacity duration-150"
                  style={{ color: 'var(--color-saul-cyan)', opacity: copied ? 1 : 0 }}
                >
                  {copied ? 'Copied!' : ''}
                </span>
                <Copy
                  size={12}
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                  style={{ color: 'var(--color-saul-text-secondary)' }}
                />
              </button>
            )}

            {lead.phone && (
              <div className="flex items-center gap-2">
                <Phone size={14} style={{ color: 'var(--color-saul-text-secondary)' }} />
                <span className="text-[12px]" style={{ color: 'var(--color-saul-text-primary)' }}>
                  {lead.phone}
                </span>
              </div>
            )}

            {linkedinUrl && (
              <a
                href={linkedinUrl.startsWith('http') ? linkedinUrl : `https://${linkedinUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 group"
              >
                <LinkedinLogo size={14} style={{ color: 'var(--color-saul-text-secondary)' }} />
                <span
                  className="text-[12px] truncate"
                  style={{ color: 'var(--color-saul-text-primary)' }}
                >
                  LinkedIn Profile
                </span>
              </a>
            )}

            {companyDomain && (
              <a
                href={companyDomain.startsWith('http') ? companyDomain : `https://${companyDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <Globe size={14} style={{ color: 'var(--color-saul-text-secondary)' }} />
                <span
                  className="text-[12px] truncate"
                  style={{ color: 'var(--color-saul-text-primary)' }}
                >
                  {companyDomain.replace(/^https?:\/\//, '')}
                </span>
              </a>
            )}

            {!lead.email && !lead.phone && !linkedinUrl && !companyDomain && (
              <span className="text-[12px]" style={{ color: 'var(--color-saul-text-tertiary)' }}>
                No contact info recorded
              </span>
            )}
          </div>

          {/* Red Flags */}
          {flags.length > 0 && (
            <div
              className="rounded-lg p-3 flex flex-col gap-2"
              style={{
                background: 'rgba(255,71,87,0.08)',
                border: '1px solid rgba(255,71,87,0.2)',
              }}
            >
              <div className="flex items-center gap-1.5">
                <Warning size={13} style={{ color: '#FF4757' }} weight="fill" />
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#FF4757' }}>
                  Red Flags
                </span>
              </div>
              {flags.map((f, i) => {
                const isCritical = f.code === 'competitor' || f.code === 'bounced_email' || f.code === 'unsubscribed'
                return (
                  <div key={i} className="flex items-start gap-1.5">
                    <Warning
                      size={12}
                      weight={isCritical ? 'fill' : 'regular'}
                      style={{ color: isCritical ? '#FF4757' : 'rgba(255,71,87,0.7)', marginTop: 1, flexShrink: 0 }}
                    />
                    <span
                      className="text-[12px] leading-snug"
                      style={{ color: isCritical ? '#FF6B7A' : 'rgba(255,107,122,0.8)' }}
                    >
                      {f.reason}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </aside>

        {/* ══ RIGHT MAIN ══════════════════════════════════════════════════════ */}
        <main className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Header */}
          <div
            className="rounded-[8px] border p-5"
            style={{
              background: 'var(--color-saul-bg-700)',
              borderColor: 'rgba(255,255,255,0.06)',
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
                      background: 'rgba(0,212,170,0.1)',
                      border: '1px solid rgba(0,212,170,0.25)',
                      color: '#00D4AA',
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
                      background: 'rgba(255,71,87,0.08)',
                      border: '1px solid rgba(255,71,87,0.2)',
                      color: '#FF4757',
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
                          border: '1px solid rgba(255,255,255,0.08)',
                          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                        }}
                        onMouseLeave={() => setShowFlagMenu(false)}
                      >
                        {['Competitor', 'Bad Data', 'Wrong ICP', 'Stale 90d', 'Negative Reply'].map(flag => (
                          <button
                            key={flag}
                            className="w-full text-left px-3 py-2 text-[13px] transition-colors duration-100 cursor-pointer"
                            style={{ color: 'var(--color-saul-text-primary)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
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

          {/* Tabs */}
          <div
            className="rounded-[8px] border flex flex-col"
            style={{
              background: 'var(--color-saul-bg-700)',
              borderColor: 'rgba(255,255,255,0.06)',
            }}
          >
            {/* Tab bar */}
            <div
              className="flex items-center gap-0 px-4 pt-1"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              {([
                { key: 'activity',   label: 'Activity' },
                { key: 'enrichment', label: 'Enrichment' },
                { key: 'scoring',    label: 'Scoring History' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="px-4 py-3 text-[13px] font-medium relative cursor-pointer transition-colors duration-150"
                  style={{
                    color: activeTab === tab.key
                      ? 'var(--color-saul-text-primary)'
                      : 'var(--color-saul-text-secondary)',
                  }}
                >
                  {tab.label}
                  {activeTab === tab.key && (
                    <motion.div
                      layoutId="tab-underline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                      style={{ background: 'var(--color-saul-cyan)' }}
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="p-5">
              <AnimatePresence mode="wait">
                {activeTab === 'activity' && (
                  <ActivityTab key="activity" activities={activities} />
                )}
                {activeTab === 'enrichment' && (
                  <EnrichmentTab key="enrichment" enrichments={enrichments} />
                )}
                {activeTab === 'scoring' && (
                  <ScoringTab key="scoring" history={scoringHistory} />
                )}
              </AnimatePresence>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

// ─── Activity Tab ─────────────────────────────────────────────────────────────

function ActivityTab({ activities }: { activities: LeadActivity[] }) {
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

// ─── Enrichment Tab ───────────────────────────────────────────────────────────

function EnrichmentTab({ enrichments }: { enrichments: EnrichmentRecord[] }) {
  if (!enrichments.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <span className="text-[13px]" style={{ color: 'var(--color-saul-text-secondary)' }}>
          No enrichment records found
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {enrichments.map((rec, i) => {
        const providerColor = PROVIDER_COLORS[rec.provider] ?? '#8B95A8'
        const status = rec.success === true ? 'completed' : rec.success === false ? 'failed' : 'pending'
        const statusVariantMap = { completed: 'success', pending: 'warning', failed: 'danger' } as const
        const isSaulWebCompleted = rec.provider === 'saul_web' && status === 'completed'
        const parsed = rec.parsed_data as SaulWebEnrichmentData

        return (
          <motion.div
            key={rec.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.05 }}
            className="rounded-[8px] p-4 flex flex-col gap-3"
            style={{
              background: 'var(--color-saul-bg-600)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {/* Header row */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex px-2 py-0.5 rounded-[4px] text-[11px] font-semibold uppercase tracking-wider"
                  style={{
                    background: `${providerColor}18`,
                    border: `1px solid ${providerColor}30`,
                    color: providerColor,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {rec.provider}
                </span>
                <Badge variant={statusVariantMap[status]}>{status}</Badge>
              </div>
              <div className="flex items-center gap-3">
                {rec.cost_cents != null && (
                  <span
                    className="text-[12px]"
                    style={{ color: 'var(--color-saul-text-secondary)', fontFamily: 'var(--font-mono)' }}
                  >
                    {formatCurrency(rec.cost_cents)}
                  </span>
                )}
                <span className="text-[11px]" style={{ color: 'var(--color-saul-text-tertiary)' }}>
                  {formatRelative(rec.enriched_at)}
                </span>
              </div>
            </div>

            {/* Error message */}
            {rec.error_message && (
              <p className="text-[12px]" style={{ color: 'var(--color-saul-danger)' }}>
                {rec.error_message}
              </p>
            )}

            {/* Saul Web parsed data */}
            {isSaulWebCompleted && parsed && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 pt-1">
                {parsed.ig_followers_approx != null && (
                  <EnrichField label="IG Followers" value={`~${parsed.ig_followers_approx.toLocaleString()}`} />
                )}
                {parsed.turo_listed != null && (
                  <EnrichField label="Turo Listed" value={parsed.turo_listed ? 'Yes' : 'No'} />
                )}
                {parsed.has_booking_flow != null && (
                  <EnrichField label="Has Booking Flow" value={parsed.has_booking_flow ? 'Yes' : 'No'} />
                )}
                {parsed.google_review_count_approx != null && (
                  <EnrichField label="Google Reviews" value={`~${parsed.google_review_count_approx}`} />
                )}
                {parsed.vehicle_quality_detected && (
                  <EnrichField label="Vehicle Quality" value={parsed.vehicle_quality_detected} />
                )}
                {(parsed.fleet_size_estimate_low != null || parsed.fleet_size_estimate_high != null) && (
                  <EnrichField
                    label="Fleet Size Est."
                    value={`${parsed.fleet_size_estimate_low ?? '?'} – ${parsed.fleet_size_estimate_high ?? '?'}`}
                  />
                )}
                {parsed.experience_only_risk != null && (
                  <EnrichField
                    label="Exp. Only Risk"
                    value={parsed.experience_only_risk ? 'Yes' : 'No'}
                    danger={parsed.experience_only_risk}
                  />
                )}
                {parsed.named_owner != null && (
                  <EnrichField
                    label="Named Owner"
                    value={parsed.named_owner_name ?? (parsed.named_owner ? 'Yes' : 'No')}
                  />
                )}
              </div>
            )}

            {/* Generic parsed data for other providers */}
            {!isSaulWebCompleted && rec.parsed_data && Object.keys(rec.parsed_data).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Object.keys(rec.parsed_data)
                  .filter(k => (rec.parsed_data as Record<string, unknown>)[k] != null)
                  .slice(0, 10)
                  .map(k => (
                    <span
                      key={k}
                      className="text-[11px] px-1.5 py-0.5 rounded"
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        color: 'var(--color-saul-text-secondary)',
                      }}
                    >
                      {k}
                    </span>
                  ))}
              </div>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}

function EnrichField({
  label,
  value,
  danger = false,
}: {
  label: string
  value: string
  danger?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-saul-text-tertiary)' }}>
        {label}
      </span>
      <span
        className="text-[13px] font-medium"
        style={{
          color: danger
            ? 'var(--color-saul-danger)'
            : 'var(--color-saul-text-primary)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Scoring History Tab ──────────────────────────────────────────────────────

function ScoringTab({ history }: { history: ScoringHistoryRecord[] }) {
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
