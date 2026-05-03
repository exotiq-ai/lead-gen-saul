'use client'

import { motion } from 'framer-motion'

import { Badge } from '@/components/ui/Badge'
import { formatRelative, formatCurrency } from '@/lib/utils/formatters'
import { useChartPalette, type ChartPalette } from '@/lib/utils/chartColors'
import type { EnrichmentRecord, SaulWebEnrichmentData } from '@/types/enrichment'

// ─── Provider helpers ─────────────────────────────────────────────────────────

function providerColors(palette: ChartPalette): Record<string, string> {
  return {
    apollo:   palette.info,
    saul_web: palette.primary,
    clearbit: palette.violet,
    linkedin: '#0A66C2', // LinkedIn brand color — kept literal in both themes
    scraper:  palette.neutral,
  }
}

// ─── Enrich Field ─────────────────────────────────────────────────────────────

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

// ─── Enrichment Timeline ──────────────────────────────────────────────────────

export function EnrichmentTimeline({ enrichments }: { enrichments: EnrichmentRecord[] }) {
  const palette = useChartPalette()
  const PROVIDER_COLORS = providerColors(palette)
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
        const providerColor = PROVIDER_COLORS[rec.provider] ?? palette.neutral
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
              border: '1px solid var(--color-saul-border)',
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
                        background: 'var(--color-saul-overlay)',
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
