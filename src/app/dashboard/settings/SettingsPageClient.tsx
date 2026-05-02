'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Gear, FloppyDisk, ArrowCounterClockwise, Check, Warning } from '@phosphor-icons/react'
import useSWR from 'swr'
import { useTenantId } from '@/lib/hooks/useTenant'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type IcpCriteria = {
  tenant_type?: 'automotive' | 'medspa'
  weights?: Record<string, number>
  scoring_tiers?: Record<string, { min: number; max: number; assigned_to: string | null; label?: string }>
}

const WEIGHT_LABELS: Record<string, { label: string; desc: string }> = {
  fleet_size: { label: 'Fleet Size', desc: 'Weighting for fleet/inventory size signal' },
  vehicle_quality: { label: 'Vehicle / Service Quality', desc: 'Quality of vehicles or med spa services' },
  market_tier: { label: 'Market Tier', desc: 'City/market tier scoring weight' },
  operational_signals: { label: 'Operational Signals', desc: 'Signs of active operations (bookings, hours, etc.)' },
  online_presence: { label: 'Online Presence', desc: 'Website, social media, reviews presence' },
  franchise_penalty: { label: 'Franchise Penalty', desc: 'Score reduction for franchise/chain businesses' },
  online_booking_absent: { label: 'No Online Booking Bonus', desc: 'Bonus when prospect lacks online booking (opportunity)' },
  template_website: { label: 'Template Website Bonus', desc: 'Bonus when site is built on templates (opportunity)' },
  low_google_reviews: { label: 'Low Reviews Bonus', desc: 'Bonus for low Google review count (room to grow)' },
}

const TIER_DEFAULTS: Record<string, { min: number; max: number; assigned_to: string | null; label: string }> = {
  tier_5: { min: 80, max: 100, assigned_to: 'gregory', label: 'Tier 5 — Hot' },
  tier_4: { min: 60, max: 79, assigned_to: 'team', label: 'Tier 4 — Warm' },
  tier_3: { min: 40, max: 59, assigned_to: 'team', label: 'Tier 3 — Lukewarm' },
  tier_2: { min: 20, max: 39, assigned_to: 'team', label: 'Tier 2 — Cool' },
  tier_1: { min: 0, max: 19, assigned_to: null, label: 'Tier 1 — Cold' },
}

export function SettingsPageClient() {
  const tenantId = useTenantId()
  const { data, error, isLoading, mutate } = useSWR(
    `/api/settings?tenant_id=${tenantId}`,
    fetcher,
  )

  const [criteria, setCriteria] = useState<IcpCriteria>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // Hydrate the editor from the freshest server snapshot. Stores the last
  // payload fingerprint in state and compares during render -- the
  // React-19-blessed pattern for "derived state that resets on prop change".
  const incomingFingerprint = data?.icp_profile?.criteria
    ? JSON.stringify(data.icp_profile.criteria)
    : null
  const [lastIncomingFingerprint, setLastIncomingFingerprint] = useState<string | null>(null)
  if (incomingFingerprint && incomingFingerprint !== lastIncomingFingerprint) {
    setLastIncomingFingerprint(incomingFingerprint)
    // Only overwrite local edits if the user hasn't touched this snapshot.
    if (!dirty && data?.icp_profile?.criteria) {
      setCriteria(data.icp_profile.criteria)
    }
  }

  function updateWeight(key: string, value: number) {
    setCriteria((prev) => ({
      ...prev,
      weights: { ...(prev.weights ?? {}), [key]: value },
    }))
    setDirty(true)
    setSaveStatus('idle')
  }

  function updateTenantType(type: 'automotive' | 'medspa') {
    setCriteria((prev) => ({ ...prev, tenant_type: type }))
    setDirty(true)
    setSaveStatus('idle')
  }

  function resetToSaved() {
    if (data?.icp_profile?.criteria) {
      setCriteria(data.icp_profile.criteria)
      setDirty(false)
      setSaveStatus('idle')
    }
  }

  async function save() {
    setSaving(true)
    setSaveStatus('idle')
    try {
      const resp = await fetch(`/api/settings?tenant_id=${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criteria }),
      })
      if (!resp.ok) throw new Error('Save failed')
      setSaveStatus('success')
      setDirty(false)
      void mutate()
    } catch {
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="px-3 sm:px-6 py-6 max-w-3xl">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-[var(--color-saul-bg-600)] rounded" />
          <div className="h-40 bg-[var(--color-saul-bg-600)] rounded-[10px]" />
          <div className="h-60 bg-[var(--color-saul-bg-600)] rounded-[10px]" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-6 py-6">
        <p className="text-red-400 text-sm">Failed to load settings</p>
      </div>
    )
  }

  const tenant = data?.tenant
  const leadCount = data?.lead_count ?? 0
  const weights = criteria.weights ?? {}
  const tiers = criteria.scoring_tiers ?? TIER_DEFAULTS

  return (
    <div className="px-3 sm:px-6 py-6 max-w-3xl space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-[8px] bg-[var(--color-saul-bg-600)] border border-[rgba(255,255,255,0.06)]">
            <Gear size={20} weight="regular" className="text-[var(--color-saul-cyan)]" />
          </span>
          <div>
            <h1 className="text-[18px] font-semibold text-[var(--color-saul-text-primary)] tracking-tight">
              Settings
            </h1>
            <p className="text-[12px] text-[var(--color-saul-text-secondary)]">
              {tenant?.name ?? 'Tenant'} · {leadCount} leads
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={resetToSaved}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-[rgba(255,255,255,0.08)] text-[12px] font-medium text-[var(--color-saul-text-secondary)] hover:text-[var(--color-saul-text-primary)] transition-all"
            >
              <ArrowCounterClockwise size={13} weight="bold" />
              Reset
            </button>
          )}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className={[
              'flex items-center gap-1.5 px-4 py-1.5 rounded-[6px] text-[12px] font-semibold transition-all',
              dirty
                ? 'bg-[var(--color-saul-cyan)] text-[var(--color-saul-bg-900)] hover:brightness-110'
                : 'bg-[var(--color-saul-bg-600)] text-[var(--color-saul-text-secondary)] cursor-not-allowed',
            ].join(' ')}
          >
            {saving ? (
              <span className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
            ) : saveStatus === 'success' ? (
              <Check size={13} weight="bold" />
            ) : (
              <FloppyDisk size={13} weight="bold" />
            )}
            {saving ? 'Saving...' : saveStatus === 'success' ? 'Saved' : 'Save'}
          </button>
        </div>
      </motion.div>

      {/* Tenant Type */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-[10px] bg-[var(--color-saul-bg-700)] border border-[rgba(255,255,255,0.06)] p-5"
      >
        <h2 className="text-[14px] font-semibold text-[var(--color-saul-text-primary)] mb-3">
          Tenant Type
        </h2>
        <div className="flex gap-3">
          {(['automotive', 'medspa'] as const).map((type) => (
            <button
              key={type}
              onClick={() => updateTenantType(type)}
              className={[
                'px-4 py-2 rounded-[6px] text-[13px] font-medium border transition-all',
                criteria.tenant_type === type
                  ? 'bg-[rgba(0,212,170,0.1)] border-[rgba(0,212,170,0.3)] text-[var(--color-saul-cyan)]'
                  : 'bg-[var(--color-saul-bg-600)] border-[rgba(255,255,255,0.06)] text-[var(--color-saul-text-secondary)] hover:text-[var(--color-saul-text-primary)]',
              ].join(' ')}
            >
              {type === 'automotive' ? '🚗 Automotive' : '💉 MedSpa'}
            </button>
          ))}
        </div>
      </motion.section>

      {/* ICP Scoring Weights */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-[10px] bg-[var(--color-saul-bg-700)] border border-[rgba(255,255,255,0.06)] p-5"
      >
        <h2 className="text-[14px] font-semibold text-[var(--color-saul-text-primary)] mb-1">
          ICP Scoring Weights
        </h2>
        <p className="text-[12px] text-[var(--color-saul-text-secondary)] mb-4">
          Adjust how much each signal contributes to lead scoring (0–100)
        </p>

        <div className="space-y-3">
          {Object.entries(WEIGHT_LABELS).map(([key, { label, desc }]) => (
            <div key={key} className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[var(--color-saul-text-primary)] font-medium truncate">{label}</p>
                <p className="text-[11px] text-[var(--color-saul-text-secondary)] truncate">{desc}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={weights[key] ?? 0}
                  onChange={(e) => updateWeight(key, +e.target.value)}
                  className="w-24 h-1 appearance-none bg-[var(--color-saul-bg-500)] rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--color-saul-cyan)] [&::-webkit-slider-thumb]:cursor-pointer"
                />
                <span className="text-[12px] text-[var(--color-saul-text-secondary)] font-mono w-8 text-right">
                  {weights[key] ?? 0}
                </span>
              </div>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Scoring Tiers */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-[10px] bg-[var(--color-saul-bg-700)] border border-[rgba(255,255,255,0.06)] p-5"
      >
        <h2 className="text-[14px] font-semibold text-[var(--color-saul-text-primary)] mb-1">
          Scoring Tiers
        </h2>
        <p className="text-[12px] text-[var(--color-saul-text-secondary)] mb-4">
          Score ranges determine lead assignment and outreach priority
        </p>

        <div className="space-y-2">
          {Object.entries(tiers).map(([key, tier]) => (
            <div
              key={key}
              className="flex items-center gap-3 px-3 py-2.5 rounded-[6px] bg-[var(--color-saul-bg-600)] border border-[rgba(255,255,255,0.04)]"
            >
              <span className="text-[13px] font-medium text-[var(--color-saul-text-primary)] flex-1">
                {tier.label ?? key}
              </span>
              <span className="text-[12px] font-mono text-[var(--color-saul-text-secondary)]">
                {tier.min}–{tier.max}
              </span>
              <span className={[
                'text-[11px] font-semibold px-2 py-0.5 rounded-full',
                tier.assigned_to === 'gregory'
                  ? 'bg-[rgba(0,212,170,0.1)] text-[var(--color-saul-cyan)]'
                  : tier.assigned_to === 'team'
                    ? 'bg-[rgba(255,255,255,0.06)] text-[var(--color-saul-text-secondary)]'
                    : 'bg-[rgba(255,100,100,0.08)] text-red-400',
              ].join(' ')}>
                {tier.assigned_to ?? 'unassigned'}
              </span>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Pipeline Stages -- new in Stage 3b. Render as a reorderable list. */}
      <PipelineStagesSection tenantId={tenantId} />

      {/* Danger Zone */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-[10px] bg-[var(--color-saul-bg-700)] border border-[rgba(255,100,100,0.15)] p-5"
      >
        <div className="flex items-center gap-2 mb-3">
          <Warning size={16} weight="fill" className="text-red-400" />
          <h2 className="text-[14px] font-semibold text-red-400">
            Danger Zone
          </h2>
        </div>
        <p className="text-[12px] text-[var(--color-saul-text-secondary)] mb-3">
          These actions are irreversible. Proceed with caution.
        </p>
        <button
          onClick={() => {
            if (window.confirm('This will re-score all leads for this tenant using current ICP weights. Continue?')) {
              // TODO: wire bulk re-score API
              alert('Bulk re-score not yet implemented')
            }
          }}
          className="px-4 py-2 rounded-[6px] border border-[rgba(255,100,100,0.25)] text-[12px] font-medium text-red-400 hover:bg-[rgba(255,100,100,0.08)] transition-all"
        >
          Re-score All Leads
        </button>
      </motion.section>

      {saveStatus === 'error' && (
        <p className="text-red-400 text-[12px] font-medium">
          Save failed. Check console for details.
        </p>
      )}
    </div>
  )
}

// ─── Pipeline Stages Section ──────────────────────────────────────────
//
// Reorder via simple up/down buttons. We avoid HTML5 drag-and-drop here
// because it's brittle across mobile + desktop and the stage list is
// rarely longer than 7 items.

type Stage = {
  id: string
  name: string
  slug: string
  position: number
  color: string | null
  is_terminal: boolean
  terminal_type: string | null
}

function PipelineStagesSection({ tenantId }: { tenantId: string }) {
  const { data, isLoading, error, mutate } = useSWR<{ stages: Stage[] }>(
    `/api/pipeline/stages?tenant_id=${tenantId}`,
    fetcher,
  )

  const [order, setOrder] = useState<Stage[]>([])
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  // Hydrate from server snapshot using the React-19-blessed
  // setState-during-render pattern.
  const fingerprint = data ? data.stages.map((s) => s.id).join(',') : null
  const [lastFingerprint, setLastFingerprint] = useState<string | null>(null)
  if (fingerprint && fingerprint !== lastFingerprint) {
    setLastFingerprint(fingerprint)
    if (data) setOrder(data.stages)
  }

  const dirty =
    !!data &&
    JSON.stringify(order.map((s) => s.id)) !==
      JSON.stringify(data.stages.map((s) => s.id))

  function move(idx: number, dir: -1 | 1) {
    const next = [...order]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    const tmp = next[idx]
    next[idx] = next[target]
    next[target] = tmp
    setOrder(next)
  }

  async function save() {
    setSaving(true)
    setErrMsg(null)
    try {
      const res = await fetch('/api/pipeline/stages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          order: order.map((s) => s.id),
        }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      void mutate()
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
      className="rounded-[10px] bg-[var(--color-saul-bg-700)] border border-[rgba(255,255,255,0.06)] p-5"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--color-saul-text-primary)]">
            Pipeline Stages
          </h2>
          <p className="text-[12px] text-[var(--color-saul-text-secondary)]">
            Order shown on the funnel chart and stage promotion dropdown.
          </p>
        </div>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-semibold transition-all',
            dirty
              ? 'bg-[var(--color-saul-cyan)] text-[var(--color-saul-bg-900)] hover:brightness-110'
              : 'bg-[var(--color-saul-bg-600)] text-[var(--color-saul-text-secondary)] cursor-not-allowed',
          ].join(' ')}
        >
          {saving ? 'Saving…' : 'Save order'}
        </button>
      </div>

      {isLoading && (
        <p className="text-[12px] text-[var(--color-saul-text-secondary)] mt-3">
          Loading stages…
        </p>
      )}
      {error && (
        <p className="text-[12px] text-rose-300 mt-3">Failed to load stages.</p>
      )}
      {errMsg && (
        <p className="text-[12px] text-rose-300 mt-2">Save failed: {errMsg}</p>
      )}

      {!isLoading && !error && order.length === 0 && (
        <p className="text-[12px] text-[var(--color-saul-text-secondary)] mt-3">
          No stages defined for this tenant. Insert rows into{' '}
          <code className="text-[var(--color-saul-cyan)]">pipeline_stages</code>{' '}
          and refresh.
        </p>
      )}

      <ul className="mt-3 space-y-1.5">
        {order.map((stage, i) => (
          <li
            key={stage.id}
            className="flex items-center gap-2 px-3 py-2 rounded-[6px] bg-[var(--color-saul-bg-600)] border border-[rgba(255,255,255,0.04)]"
          >
            <span className="text-[11px] font-mono text-[var(--color-saul-text-tertiary)] w-6 text-center">
              {i + 1}
            </span>
            <span className="text-[13px] font-medium text-[var(--color-saul-text-primary)] flex-1">
              {stage.name}
            </span>
            {stage.is_terminal && (
              <span
                className={[
                  'text-[10px] font-mono uppercase px-2 py-0.5 rounded-full',
                  stage.terminal_type === 'won'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-rose-500/15 text-rose-300',
                ].join(' ')}
              >
                {stage.terminal_type ?? 'terminal'}
              </span>
            )}
            <button
              onClick={() => move(i, -1)}
              disabled={i === 0 || saving}
              className="px-2 py-0.5 text-[12px] font-mono rounded border border-[rgba(255,255,255,0.08)] text-[var(--color-saul-text-secondary)] hover:text-[var(--color-saul-text-primary)] disabled:opacity-30"
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              onClick={() => move(i, 1)}
              disabled={i === order.length - 1 || saving}
              className="px-2 py-0.5 text-[12px] font-mono rounded border border-[rgba(255,255,255,0.08)] text-[var(--color-saul-text-secondary)] hover:text-[var(--color-saul-text-primary)] disabled:opacity-30"
              aria-label="Move down"
            >
              ↓
            </button>
          </li>
        ))}
      </ul>
    </motion.section>
  )
}
