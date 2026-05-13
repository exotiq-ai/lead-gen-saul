'use client'

import { motion } from 'framer-motion'
import useSWR from 'swr'
import {
  CalendarCheck,
  Clock,
  TrendUp,
  CurrencyDollar,
  PaperPlaneTilt,
  ChatCircleDots,
  Lightning,
  Robot,
} from '@phosphor-icons/react'
import { KPICard } from '@/components/dashboard/KPICard'
import { SkeletonKPI } from '@/components/ui'
import { useTenantId } from '@/lib/hooks/useTenant'
import { useDemoFetcher } from '@/lib/demo/useDemoFetcher'
import { useChartPalette } from '@/lib/utils/chartColors'
import { formatCurrency } from '@/lib/utils/formatters'

interface FunnelStage {
  stage: string
  count: number
}

interface ROIData {
  meetings_booked: number
  meetings_trend: number
  time_saved_hours: number
  outreach_sent: number
  outreach_replied: number
  reply_rate: number
  lead_velocity_week: number
  leads_qualified: number
  leads_converted: number
  conversion_rate: number
  cost_per_lead_cents: number
  cost_per_qualified_cents: number
  total_spend_cents: number
  roi_multiple: number
  pipeline_value_estimate: number
  funnel: FunnelStage[]
  agent_uptime_pct: number
  avg_response_time_hours: number
}

export function ROIPageClient() {
  const tenantId = useTenantId()
  const fetcher = useDemoFetcher() as (url: string) => Promise<ROIData>
  const palette = useChartPalette()

  const { data, isLoading } = useSWR<ROIData>(
    `/api/dashboard/roi?tenant_id=${tenantId}`,
    fetcher,
  )

  const ease = [0.25, 0.46, 0.45, 0.94] as const

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h1
            className="text-[22px] font-semibold leading-tight tracking-tight"
            style={{ color: 'var(--color-saul-text-primary)', fontFamily: 'var(--font-mono)' }}
          >
            ROI Dashboard
          </h1>
          <p className="text-[13px]" style={{ color: 'var(--color-saul-text-secondary)' }}>
            Return on investment metrics &amp; conversion funnel
          </p>
        </div>
      </div>

      {/* Hero KPI Row */}
      <section aria-label="Key ROI metrics">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading || !data ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonKPI key={i} />)
          ) : (
            <>
              <KPICard
                title="Meetings Booked"
                value={data.meetings_booked}
                trend={data.meetings_trend}
                trendLabel="vs last period"
                format="number"
                accentColor={palette.primary}
              />
              <KPICard
                title="Time Saved"
                value={data.time_saved_hours}
                unit="hrs"
                format="number"
                accentColor={palette.info}
              />
              <KPICard
                title="ROI Multiple"
                value={`${data.roi_multiple}×`}
                format="number"
                accentColor={palette.success}
              />
              <KPICard
                title="Pipeline Value"
                value={data.pipeline_value_estimate / 100}
                format="currency"
                accentColor={palette.violet}
              />
            </>
          )}
        </div>
      </section>

      {/* Conversion Funnel */}
      <motion.section
        aria-label="Conversion funnel"
        className="rounded-xl p-6"
        style={{ background: 'var(--color-saul-bg-700)', border: '1px solid var(--color-saul-border)' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2, ease }}
      >
        <h2 className="text-sm font-semibold mb-5" style={{ color: 'var(--color-saul-text-primary)' }}>
          Conversion Funnel
        </h2>

        {data?.funnel && data.funnel.length > 0 ? (
          <FunnelVisualization funnel={data.funnel} palette={palette} />
        ) : (
          <div className="h-[200px] flex items-center justify-center">
            <span className="text-sm" style={{ color: 'var(--color-saul-text-tertiary)' }}>
              Loading funnel data...
            </span>
          </div>
        )}
      </motion.section>

      {/* Secondary Metrics Grid */}
      <motion.section
        aria-label="Secondary metrics"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.35, ease }}
      >
        <MetricCard
          icon={PaperPlaneTilt}
          label="Outreach Sent"
          value={data?.outreach_sent ?? 0}
          format="number"
          palette={palette}
        />
        <MetricCard
          icon={ChatCircleDots}
          label="Reply Rate"
          value={data?.reply_rate ?? 0}
          suffix="%"
          format="decimal"
          palette={palette}
        />
        <MetricCard
          icon={CurrencyDollar}
          label="Cost / Lead"
          value={data?.cost_per_lead_cents ?? 0}
          format="currency"
          palette={palette}
        />
        <MetricCard
          icon={Robot}
          label="Agent Uptime"
          value={data?.agent_uptime_pct ?? 0}
          suffix="%"
          format="decimal"
          palette={palette}
        />
        <MetricCard
          icon={Lightning}
          label="Lead Velocity"
          value={data?.lead_velocity_week ?? 0}
          suffix="/wk"
          format="number"
          palette={palette}
        />
        <MetricCard
          icon={TrendUp}
          label="Conversion Rate"
          value={data?.conversion_rate ?? 0}
          suffix="%"
          format="decimal"
          palette={palette}
        />
        <MetricCard
          icon={CurrencyDollar}
          label="Cost / Qualified"
          value={data?.cost_per_qualified_cents ?? 0}
          format="currency"
          palette={palette}
        />
        <MetricCard
          icon={CalendarCheck}
          label="Avg Response"
          value={data?.avg_response_time_hours ?? 0}
          suffix="hrs"
          format="decimal"
          palette={palette}
        />
      </motion.section>
    </div>
  )
}

function FunnelVisualization({
  funnel,
  palette,
}: {
  funnel: FunnelStage[]
  palette: ReturnType<typeof useChartPalette>
}) {
  const maxCount = funnel[0]?.count ?? 1
  const colors = [
    palette.series[0],
    palette.series[1],
    palette.series[2],
    palette.series[3],
    palette.series[4],
    palette.series[5] ?? palette.primary,
  ]

  return (
    <div className="flex flex-col gap-3">
      {funnel.map((stage, i) => {
        const pct = (stage.count / maxCount) * 100
        const color = colors[i % colors.length]
        const dropPct = i > 0 ? Math.round(((funnel[i - 1].count - stage.count) / funnel[i - 1].count) * 100) : null

        return (
          <div key={stage.stage} className="flex items-center gap-4">
            <span
              className="text-xs font-medium w-28 shrink-0 truncate"
              style={{ color: palette.textSecondary }}
            >
              {stage.stage}
            </span>
            <div className="flex-1 h-8 rounded-md overflow-hidden relative" style={{ background: palette.divider }}>
              <motion.div
                className="h-full rounded-md flex items-center px-3"
                style={{ background: `${color}33`, borderLeft: `3px solid ${color}` }}
                initial={{ width: '0%' }}
                animate={{ width: `${Math.max(pct, 3)}%` }}
                transition={{ duration: 0.8, delay: 0.06 * i, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <span
                  className="text-xs font-semibold whitespace-nowrap"
                  style={{ color: palette.textPrimary, fontFamily: 'var(--font-mono)' }}
                >
                  {stage.count.toLocaleString()}
                </span>
              </motion.div>
            </div>
            <span
              className="text-[11px] w-14 text-right shrink-0"
              style={{ color: palette.textTertiary, fontFamily: 'var(--font-mono)' }}
            >
              {dropPct !== null ? `−${dropPct}%` : '100%'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  suffix,
  format,
  palette,
}: {
  icon: React.ElementType
  label: string
  value: number
  suffix?: string
  format: 'number' | 'currency' | 'decimal'
  palette: ReturnType<typeof useChartPalette>
}) {
  let displayValue: string
  if (format === 'currency') {
    displayValue = formatCurrency(value)
  } else if (format === 'decimal') {
    displayValue = value.toFixed(1)
  } else {
    displayValue = value.toLocaleString()
  }

  return (
    <div
      className="flex items-center gap-3 p-4 rounded-lg"
      style={{ background: 'var(--color-saul-bg-700)', border: '1px solid var(--color-saul-border)' }}
    >
      <div
        className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
        style={{ background: `color-mix(in srgb, ${palette.primary} 10%, transparent)` }}
      >
        <Icon size={18} weight="duotone" style={{ color: palette.primary }} />
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[11px] uppercase tracking-wider truncate" style={{ color: palette.textTertiary }}>
          {label}
        </span>
        <span
          className="text-[16px] font-semibold leading-tight"
          style={{ color: palette.textPrimary, fontFamily: 'var(--font-mono)' }}
        >
          {displayValue}{suffix && <span className="text-[12px] ml-0.5" style={{ color: palette.textSecondary }}>{suffix}</span>}
        </span>
      </div>
    </div>
  )
}
