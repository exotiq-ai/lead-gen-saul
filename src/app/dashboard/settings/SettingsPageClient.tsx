'use client'

import { useState, useEffect } from 'react'
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

  useEffect(() => {
    if (data?.icp_profile?.criteria) {
      setCriteria(data.icp_profile.criteria)
      setDirty(false)
    }
  }, [data])

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
      <div className="px-6 py-6 max-w-3xl">
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
    <div className="px-6 py-6 max-w-3xl space-y-6">
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
