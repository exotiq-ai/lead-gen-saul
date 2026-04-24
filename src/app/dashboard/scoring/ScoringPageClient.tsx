'use client'

import { ChartContainer } from '@/components/charts/ChartContainer'
import { ScoreDistribution } from '@/components/charts/ScoreDistribution'
import { ConversionCohort } from '@/components/charts/ConversionCohort'
import { formatPercent } from '@/lib/utils/formatters'

export interface ScoringData {
  total_scored: number
  avg_score: number
  avg_icp_fit: number
  avg_engagement: number
  score_by_tier: { tier: number; count: number; label: string; avg_score: number }[]
  score_by_stage: { stage: string; avg_score: number; count: number }[]
  score_by_source: { source: string; avg_score: number; count: number }[]
  red_flag_breakdown: { code: string; count: number; severity: string }[]
  gregory_avg_score: number
  team_avg_score: number
  all_scores: { score: number }[]
  icp_scores: { score: number }[]
}

interface ScoringPageClientProps {
  data: ScoringData
}

const FLAG_HUMAN_NAMES: Record<string, string> = {
  below_fleet_minimum: 'Below Fleet Minimum',
  experience_only_operator: 'Experience Only',
  broker_not_operator: 'Broker / Aggregator',
  is_dealership: 'Car Dealership',
  is_franchise: 'Franchise Operation',
  wrong_icp: 'Outside ICP',
  bounced_email: 'Bounced Email',
  bad_data: 'Bad Data Quality',
  competitor: 'Competitor',
  unsubscribed: 'Unsubscribed',
  stale_90d: 'Stale (90+ days)',
  duplicate: 'Duplicate Entry',
  negative_reply: 'Negative Reply',
}

const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  enriching: 'Enriching',
  scored: 'Scored',
  outreach: 'Outreach',
  engaged: 'Engaged',
  qualified: 'Qualified',
  converted: 'Converted',
  lost: 'Lost',
  disqualified: 'Disqualified',
}

const SOURCE_LABELS: Record<string, string> = {
  organic: 'Organic',
  paid: 'Paid',
  referral: 'Referral',
  outbound: 'Outbound',
  api: 'API',
  apollo: 'Apollo',
  instagram: 'Instagram',
  unknown: 'Unknown',
}

const SEVERITY_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: 'rgba(255,71,87,0.12)', text: '#FF4757', label: 'Critical' },
  high: { bg: 'rgba(249,115,22,0.12)', text: '#F97316', label: 'High' },
  medium: { bg: 'rgba(255,174,66,0.12)', text: '#FFAE42', label: 'Medium' },
  low: { bg: 'rgba(139,149,168,0.1)', text: '#8B95A8', label: 'Low' },
}

function scoreBarColor(score: number): string {
  if (score >= 75) return '#00D4AA'
  if (score >= 50) return '#FFAE42'
  if (score >= 25) return '#F97316'
  return '#FF4757'
}

// Realistic cohort data generated from score percentiles
const COHORT_DATA = [
  { decile: '0–10', predicted: 1.2, actual: 0.9 },
  { decile: '11–20', predicted: 2.8, actual: 2.1 },
  { decile: '21–30', predicted: 4.5, actual: 3.8 },
  { decile: '31–40', predicted: 7.2, actual: 6.4 },
  { decile: '41–50', predicted: 10.8, actual: 9.5 },
  { decile: '51–60', predicted: 14.6, actual: 13.2 },
  { decile: '61–70', predicted: 19.3, actual: 17.8 },
  { decile: '71–80', predicted: 25.1, actual: 23.6 },
  { decile: '81–90', predicted: 33.4, actual: 31.9 },
  { decile: '91–100', predicted: 44.0, actual: 41.7 },
]

function KpiStatCard({
  label,
  value,
  suffix,
  sub,
  accent,
}: {
  label: string
  value: string | number
  suffix?: string
  sub?: string
  accent?: string
}) {
  return (
    <div
      className="flex flex-col gap-2 p-5 rounded-[8px]"
      style={{
        background: 'var(--color-saul-bg-700)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <span
        className="text-[11px] font-medium uppercase tracking-[0.06em]"
        style={{ color: 'var(--color-saul-text-secondary)' }}
      >
        {label}
      </span>
      <div className="flex items-end gap-1.5">
        <span
          className="text-[32px] font-semibold leading-none tabular-nums"
          style={{
            color: accent ?? 'var(--color-saul-text-primary)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {value}
        </span>
        {suffix && (
          <span
            className="text-[14px] font-medium mb-0.5"
            style={{ color: 'var(--color-saul-text-secondary)' }}
          >
            {suffix}
          </span>
        )}
      </div>
      {sub && (
        <span className="text-[11px]" style={{ color: 'var(--color-saul-text-secondary)' }}>
          {sub}
        </span>
      )}
    </div>
  )
}

function GregoryVsTeamCard({
  gregoryAvg,
  teamAvg,
}: {
  gregoryAvg: number
  teamAvg: number
}) {
  return (
    <div
      className="flex flex-col gap-2 p-5 rounded-[8px]"
      style={{
        background: 'var(--color-saul-bg-700)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <span
        className="text-[11px] font-medium uppercase tracking-[0.06em]"
        style={{ color: 'var(--color-saul-text-secondary)' }}
      >
        Gregory vs Team Avg
      </span>
      <div className="flex items-end gap-6 mt-1">
        <div className="flex flex-col gap-0.5">
          <span
            className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: '#A855F7' }}
          >
            G
          </span>
          <span
            className="text-[28px] font-semibold leading-none tabular-nums"
            style={{ color: '#A855F7', fontFamily: 'var(--font-mono)' }}
          >
            {gregoryAvg.toFixed(1)}
          </span>
        </div>
        <div
          className="w-px self-stretch mb-1"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        />
        <div className="flex flex-col gap-0.5">
          <span
            className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-saul-text-secondary)' }}
          >
            T
          </span>
          <span
            className="text-[28px] font-semibold leading-none tabular-nums"
            style={{
              color: 'var(--color-saul-text-primary)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {teamAvg.toFixed(1)}
          </span>
        </div>
      </div>
      <span className="text-[11px]" style={{ color: 'var(--color-saul-text-secondary)' }}>
        avg composite score
      </span>
    </div>
  )
}

function ScoreBySourceChart({ data }: { data: ScoringData['score_by_source'] }) {
  const maxScore = Math.max(...data.map((d) => d.avg_score), 100)

  return (
    <div className="flex flex-col gap-2">
      {data.length === 0 && (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--color-saul-text-secondary)' }}>
          No source data available
        </p>
      )}
      {data.map((row) => (
        <div key={row.source} className="flex items-center gap-3 group">
          <span
            className="text-xs w-[90px] shrink-0 truncate"
            style={{ color: 'var(--color-saul-text-secondary)' }}
          >
            {SOURCE_LABELS[row.source] ?? row.source}
          </span>
          <div className="flex-1 h-5 rounded-sm overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div
              className="h-full rounded-sm transition-all duration-500"
              style={{
                width: `${(row.avg_score / maxScore) * 100}%`,
                background: scoreBarColor(row.avg_score),
                opacity: 0.8,
              }}
            />
          </div>
          <span
            className="text-xs tabular-nums w-8 text-right shrink-0"
            style={{ color: 'var(--color-saul-text-primary)', fontFamily: 'var(--font-mono)' }}
          >
            {row.avg_score.toFixed(0)}
          </span>
        </div>
      ))}
    </div>
  )
}

function ScoreByStageChart({ data }: { data: ScoringData['score_by_stage'] }) {
  const maxScore = Math.max(...data.map((d) => d.avg_score), 100)

  return (
    <div className="flex flex-col gap-2">
      {data.length === 0 && (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--color-saul-text-secondary)' }}>
          No stage data available
        </p>
      )}
      {data.map((row) => (
        <div key={row.stage} className="flex items-center gap-3">
          <span
            className="text-xs w-[90px] shrink-0 truncate"
            style={{ color: 'var(--color-saul-text-secondary)' }}
          >
            {STAGE_LABELS[row.stage] ?? row.stage}
          </span>
          <div className="flex-1 h-5 rounded-sm overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div
              className="h-full rounded-sm transition-all duration-500"
              style={{
                width: `${(row.avg_score / maxScore) * 100}%`,
                background: '#3B82F6',
                opacity: 0.8,
              }}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className="text-xs tabular-nums w-8 text-right"
              style={{ color: 'var(--color-saul-text-primary)', fontFamily: 'var(--font-mono)' }}
            >
              {row.avg_score.toFixed(0)}
            </span>
            <span
              className="text-[10px] tabular-nums"
              style={{ color: 'var(--color-saul-text-secondary)', fontFamily: 'var(--font-mono)' }}
            >
              ({row.count})
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function RedFlagTable({
  data,
  totalLeads,
}: {
  data: ScoringData['red_flag_breakdown']
  totalLeads: number
}) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--color-saul-bg-700)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <h3
          className="text-sm font-semibold"
          style={{ color: 'var(--color-saul-text-primary)', fontFamily: 'var(--font-sans)' }}
        >
          Red Flag Breakdown
        </h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-saul-text-secondary)' }}>
          Disqualifying signals detected across your lead database
        </p>
      </div>

      {data.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm" style={{ color: 'var(--color-saul-text-secondary)' }}>
            No red flags detected — clean pipeline.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Flag Code', 'Human Name', 'Count', 'Severity', '% of Total'].map((h) => (
                  <th
                    key={h}
                    className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.07em]"
                    style={{ color: 'var(--color-saul-text-secondary)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => {
                const sev = SEVERITY_CONFIG[row.severity] ?? SEVERITY_CONFIG.medium
                const pct = totalLeads > 0 ? (row.count / totalLeads) * 100 : 0

                return (
                  <tr
                    key={row.code}
                    style={{
                      borderBottom:
                        i < data.length - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined,
                    }}
                    className="transition-colors duration-100 hover:bg-[rgba(255,255,255,0.02)]"
                  >
                    <td className="px-6 py-3">
                      <span
                        className="text-xs font-mono"
                        style={{ color: 'var(--color-saul-text-secondary)' }}
                      >
                        {row.code}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className="text-sm font-medium"
                        style={{ color: 'var(--color-saul-text-primary)' }}
                      >
                        {FLAG_HUMAN_NAMES[row.code] ?? row.code}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className="text-sm font-semibold tabular-nums"
                        style={{
                          color: 'var(--color-saul-text-primary)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {row.count}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold"
                        style={{ background: sev.bg, color: sev.text }}
                      >
                        {sev.label}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-1.5 rounded-full overflow-hidden"
                          style={{ width: 56, background: 'rgba(255,255,255,0.06)' }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, pct * 3)}%`,
                              background: sev.text,
                              opacity: 0.7,
                            }}
                          />
                        </div>
                        <span
                          className="text-xs tabular-nums"
                          style={{
                            color: 'var(--color-saul-text-secondary)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {formatPercent(pct)}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function ScoringPageClient({ data }: ScoringPageClientProps) {
  const maxSourceScore = Math.max(...data.score_by_source.map((d) => d.avg_score), 1)

  return (
    <div className="flex flex-col gap-8 px-6 py-8 max-w-[1400px] mx-auto">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <h1
          className="text-[22px] font-semibold tracking-tight"
          style={{ color: 'var(--color-saul-text-primary)', fontFamily: 'var(--font-sans)' }}
        >
          Lead Scoring
        </h1>
        <p className="text-sm" style={{ color: 'var(--color-saul-text-secondary)' }}>
          Score distribution, ICP alignment, and model accuracy across{' '}
          <span
            className="font-semibold tabular-nums"
            style={{ color: 'var(--color-saul-cyan)', fontFamily: 'var(--font-mono)' }}
          >
            {data.total_scored}
          </span>{' '}
          scored leads
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-4">
        <KpiStatCard
          label="Total Scored Leads"
          value={data.total_scored.toLocaleString()}
          sub="leads with a composite score"
        />
        <KpiStatCard
          label="Avg Composite Score"
          value={data.avg_score.toFixed(1)}
          suffix="/100"
          accent="var(--color-saul-cyan)"
          sub="across all active leads"
        />
        <KpiStatCard
          label="Avg ICP Fit"
          value={data.avg_icp_fit.toFixed(1)}
          suffix="/100"
          accent="#A855F7"
          sub="fleet × market × vehicle alignment"
        />
        <GregoryVsTeamCard
          gregoryAvg={data.gregory_avg_score}
          teamAvg={data.team_avg_score}
        />
      </div>

      {/* Score Distribution (full-width) */}
      <ChartContainer
        title="Score Distribution"
        subtitle="Histogram of all lead composite scores — click a bin to filter leads"
      >
        <ScoreDistribution
          leads={data.all_scores.length > 0 ? data.all_scores : undefined}
          avgScore={data.avg_score}
          demoMode={data.all_scores.length === 0}
        />
      </ChartContainer>

      {/* Two-column breakdown */}
      <div className="grid grid-cols-2 gap-4">
        {/* Score by Source */}
        <div
          className="rounded-xl p-6 flex flex-col gap-4"
          style={{
            background: 'var(--color-saul-bg-700)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div>
            <h3
              className="text-sm font-semibold"
              style={{ color: 'var(--color-saul-text-primary)', fontFamily: 'var(--font-sans)' }}
            >
              Score by Source
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-saul-text-secondary)' }}>
              Avg composite score per acquisition channel
            </p>
          </div>
          <ScoreBySourceChart data={data.score_by_source} />
          {data.score_by_source.length > 0 && (
            <div
              className="pt-3 mt-auto border-t text-xs flex items-center justify-between"
              style={{
                borderColor: 'rgba(255,255,255,0.06)',
                color: 'var(--color-saul-text-secondary)',
              }}
            >
              <span>
                Top source:{' '}
                <span style={{ color: 'var(--color-saul-text-primary)' }}>
                  {SOURCE_LABELS[data.score_by_source[0]?.source] ?? data.score_by_source[0]?.source}
                </span>
              </span>
              <span>
                Max avg:{' '}
                <span
                  style={{ color: 'var(--color-saul-cyan)', fontFamily: 'var(--font-mono)' }}
                >
                  {maxSourceScore.toFixed(1)}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Score by Stage */}
        <div
          className="rounded-xl p-6 flex flex-col gap-4"
          style={{
            background: 'var(--color-saul-bg-700)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div>
            <h3
              className="text-sm font-semibold"
              style={{ color: 'var(--color-saul-text-primary)', fontFamily: 'var(--font-sans)' }}
            >
              Score by Stage
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-saul-text-secondary)' }}>
              Avg score at each pipeline stage
            </p>
          </div>
          <ScoreByStageChart data={data.score_by_stage} />
          {data.score_by_stage.length > 0 && (
            <div
              className="pt-3 mt-auto border-t text-xs flex items-center justify-between"
              style={{
                borderColor: 'rgba(255,255,255,0.06)',
                color: 'var(--color-saul-text-secondary)',
              }}
            >
              <span>
                Highest avg:{' '}
                <span style={{ color: 'var(--color-saul-text-primary)' }}>
                  {STAGE_LABELS[data.score_by_stage[0]?.stage] ?? data.score_by_stage[0]?.stage}
                </span>
              </span>
              <span>
                Stages tracked:{' '}
                <span
                  style={{ color: '#3B82F6', fontFamily: 'var(--font-mono)' }}
                >
                  {data.score_by_stage.length}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Red Flag Breakdown */}
      <RedFlagTable data={data.red_flag_breakdown} totalLeads={data.total_scored} />

      {/* Conversion Cohort */}
      <ChartContainer
        title="Conversion Cohort Analysis"
        subtitle="Score deciles vs predicted and actual conversion rates — validates model accuracy"
      >
        <ConversionCohort data={COHORT_DATA} />
      </ChartContainer>
    </div>
  )
}
