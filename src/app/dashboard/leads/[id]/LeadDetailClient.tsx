'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft } from '@phosphor-icons/react'

import { LeadHeader } from '@/components/leads/detail/LeadHeader'
import { ScoreBreakdownPanel } from '@/components/leads/detail/ScoreBreakdownPanel'
import type { Lead, LeadActivity } from '@/types/lead'
import type { EnrichmentRecord } from '@/types/enrichment'
import type { ScoringHistoryRecord } from './page'

// Below-the-fold timelines: lazy-loaded to keep first paint light.
const ActivityTimeline = dynamic(
  () => import('@/components/leads/detail/ActivityTimeline').then(m => m.ActivityTimeline),
  { ssr: false, loading: () => <div className="h-32 skeleton-shimmer rounded-md" /> },
)

const ScoringTimeline = dynamic(
  () => import('@/components/leads/detail/ActivityTimeline').then(m => m.ScoringTimeline),
  { ssr: false, loading: () => <div className="h-32 skeleton-shimmer rounded-md" /> },
)

const EnrichmentTimeline = dynamic(
  () => import('@/components/leads/detail/EnrichmentTimeline').then(m => m.EnrichmentTimeline),
  { ssr: false, loading: () => <div className="h-32 skeleton-shimmer rounded-md" /> },
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
        <ScoreBreakdownPanel lead={lead} isAssignedToGregory={isAssignedToGregory} />

        {/* ══ RIGHT MAIN ══════════════════════════════════════════════════════ */}
        <main className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Header */}
          <LeadHeader
            lead={lead}
            stageName={stageName}
            isAssignedToGregory={isAssignedToGregory}
          />

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
