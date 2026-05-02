'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Envelope,
  Phone,
  Globe,
  LinkedinLogo,
  Warning,
  Copy,
} from '@phosphor-icons/react'

import { Badge } from '@/components/ui/Badge'
import type { Lead } from '@/types/lead'

// ─── Tier helpers ─────────────────────────────────────────────────────────────

export function getTierInfo(score: number): { tier: number; label: string; color: string } {
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

// ─── Panel ────────────────────────────────────────────────────────────────────

interface ScoreBreakdownPanelProps {
  lead: Lead
  isAssignedToGregory: boolean
}

export function ScoreBreakdownPanel({ lead, isAssignedToGregory }: ScoreBreakdownPanelProps) {
  const [copied, setCopied] = useState(false)

  const score     = lead.score ?? 0
  const breakdown = lead.score_breakdown
  const flags     = lead.red_flags ?? []

  // Safe-access fields that may exist in DB but not yet in TS type
  const l = lead as Lead & Record<string, unknown>
  const icpFitScore     = (l.icp_fit_score     as number | null) ?? null
  const engagementScore = (l.engagement_score  as number | null) ?? null
  const linkedinUrl     = (l.linkedin_url      as string | null)
    ?? (l.linkedin       as string | null) ?? null
  const companyDomain   = (l.company_domain    as string | null)
    ?? (l.website        as string | null) ?? null
  const companySize     = (l.company_size      as string | null) ?? null

  function copyEmail() {
    if (!lead.email) return
    navigator.clipboard.writeText(lead.email)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
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
  )
}
