'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Phone, ClipboardText } from '@phosphor-icons/react'

import { LeadHeader } from '@/components/leads/detail/LeadHeader'
import { ScoreBreakdownPanel } from '@/components/leads/detail/ScoreBreakdownPanel'
import { SkeletonBlock } from '@/components/ui'
import { Badge } from '@/components/ui/Badge'
import { buildCallPrep } from '@/lib/exotiq/callPrep'
import type { Lead, LeadActivity } from '@/types/lead'
import type { EnrichmentRecord } from '@/types/enrichment'
import type { ScoringHistoryRecord } from './page'

// Below-the-fold timelines: lazy-loaded to keep first paint light.
const TimelineFallback = () => <SkeletonBlock height={128} rounded="rounded-md" />

const ActivityTimeline = dynamic(
  () => import('@/components/leads/detail/ActivityTimeline').then(m => m.ActivityTimeline),
  { ssr: false, loading: TimelineFallback },
)

const ScoringTimeline = dynamic(
  () => import('@/components/leads/detail/ActivityTimeline').then(m => m.ScoringTimeline),
  { ssr: false, loading: TimelineFallback },
)

const EnrichmentTimeline = dynamic(
  () => import('@/components/leads/detail/EnrichmentTimeline').then(m => m.EnrichmentTimeline),
  { ssr: false, loading: TimelineFallback },
)

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeadDetailClientProps {
  lead: Lead
  activities: LeadActivity[]
  enrichments: EnrichmentRecord[]
  stageName: string | null
  scoringHistory: ScoringHistoryRecord[]
}

type Tab = 'activity' | 'enrichment' | 'scoring'

// ─── Main component ───────────────────────────────────────────────────────────

export function LeadDetailClient({
  lead,
  activities,
  enrichments,
  stageName,
  scoringHistory,
}: LeadDetailClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('activity')

  const isAssignedToGregory = lead.assigned_to === 'gregory'
  const callPrep = buildCallPrep({
    company_name: lead.company_name,
    first_name: lead.first_name,
    last_name: lead.last_name,
    phone: lead.phone,
    email: lead.email,
    company_domain: (lead as unknown as Record<string, unknown>).company_domain as string | null | undefined,
    company_location: (lead as unknown as Record<string, unknown>).company_location as string | null | undefined,
    score: lead.score,
    score_breakdown: lead.score_breakdown as unknown as Record<string, unknown> | null,
  })

  async function copyCallScript() {
    try {
      await navigator.clipboard.writeText(callPrep.ghlCallScript)
    } catch (e) {
      console.error(e)
      alert('Could not copy call script to clipboard')
    }
  }

  return (
    <div className="flex flex-col gap-0 min-h-screen" style={{ color: 'var(--color-saul-text-primary)' }}>
      {/* ── Back nav ── */}
      <div className="px-6 pt-4 pb-2">
        <button
          onClick={() => router.push('/dashboard/leads')}
          className="flex items-center gap-1.5 text-sm rounded-[6px] px-2 py-1 -mx-2 text-[var(--color-saul-text-secondary)] hover:text-[var(--color-saul-text-primary)] hover:bg-[var(--color-saul-overlay-soft)] transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-saul-cyan)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-saul-bg-800)]"
        >
          <ArrowLeft size={14} />
          <span>All Leads</span>
        </button>
      </div>

      {/* ── 3-col grid ── */}
      <div className="flex flex-1 gap-0 px-6 pb-8" style={{ alignItems: 'flex-start' }}>

        {/* ══ LEFT PANEL ══════════════════════════════════════════════════════ */}
        <ScoreBreakdownPanel lead={lead} isAssignedToGregory={isAssignedToGregory} />

        {/* ══ RIGHT MAIN ══════════════════════════════════════════════════════ */}
        <main className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Header */}
          <LeadHeader
            lead={lead}
            stageName={stageName}
            isAssignedToGregory={isAssignedToGregory}
          />

          <section className="rounded-[8px] border p-4" style={{ background: 'var(--color-saul-bg-700)', borderColor: 'color-mix(in_srgb,var(--color-saul-cyan)_25%,transparent)' }}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-saul-cyan)]">
                <Phone size={16} weight="bold" />
                Operator call sheet
              </span>
              <Badge className="text-[10px]">Phone {callPrep.phoneConfidence}</Badge>
              <span className="text-[12px] text-[var(--color-saul-text-secondary)]">{callPrep.phoneSource}</span>
              {callPrep.phoneHref && (
                <a
                  href={callPrep.phoneHref}
                  className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold text-[var(--color-saul-cyan)] border border-[color-mix(in_srgb,var(--color-saul-cyan)_35%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-saul-cyan)_12%,transparent)]"
                >
                  <Phone size={14} weight="bold" />
                  {callPrep.callablePhone}
                </a>
              )}
              <button
                type="button"
                onClick={() => void copyCallScript()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] text-[var(--color-saul-text-secondary)] border border-[var(--color-saul-border)] hover:text-[var(--color-saul-cyan)] hover:bg-[var(--color-saul-overlay-soft)]"
              >
                <ClipboardText size={14} weight="bold" />
                Copy script
              </button>
            </div>
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-[var(--color-saul-text-primary)]/90">{callPrep.opener}</p>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-saul-text-tertiary)] mb-1">Call questions</p>
                <ul className="space-y-1 text-[12px] text-[var(--color-saul-text-secondary)] list-disc pl-4">
                  {callPrep.qualifyingQuestions.map((q) => <li key={q}>{q}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-saul-text-tertiary)] mb-1">Proof points</p>
                <ul className="space-y-1 text-[12px] text-[var(--color-saul-text-secondary)] list-disc pl-4">
                  {(callPrep.proofPoints.length ? callPrep.proofPoints : ['No verified proof points yet, keep discovery-led.']).map((p) => <li key={p}>{p}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-saul-text-tertiary)] mb-1">Do not say</p>
                <ul className="space-y-1 text-[12px] text-[var(--color-saul-text-secondary)] list-disc pl-4">
                  {callPrep.doNotSay.map((p) => <li key={p}>{p}</li>)}
                </ul>
                <p className="mt-2 text-[12px] font-medium text-[var(--color-saul-text-primary)]">Next: {callPrep.nextBestAction}</p>
              </div>
            </div>
          </section>

          {/* Tabs */}
          <div
            className="rounded-[8px] border flex flex-col"
            style={{
              background: 'var(--color-saul-bg-700)',
              borderColor: 'var(--color-saul-border)',
            }}
          >
            {/* Tab bar */}
            <div
              className="flex items-center gap-0 px-4 pt-1"
              style={{ borderBottom: '1px solid var(--color-saul-border)' }}
            >
              {([
                { key: 'activity',   label: 'Activity' },
                { key: 'enrichment', label: 'Enrichment' },
                { key: 'scoring',    label: 'Scoring History' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="px-4 py-3 text-[13px] font-medium relative cursor-pointer transition-colors duration-150 hover:text-[var(--color-saul-text-primary)] hover:bg-[var(--color-saul-overlay-soft)] rounded-t-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-saul-cyan)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-saul-bg-700)]"
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
                  <ActivityTimeline key="activity" activities={activities} />
                )}
                {activeTab === 'enrichment' && (
                  <EnrichmentTimeline key="enrichment" enrichments={enrichments} />
                )}
                {activeTab === 'scoring' && (
                  <ScoringTimeline key="scoring" history={scoringHistory} />
                )}
              </AnimatePresence>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
