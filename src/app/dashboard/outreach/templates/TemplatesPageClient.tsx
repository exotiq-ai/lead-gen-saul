'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { ArrowLeft, FloppyDisk, ArrowCounterClockwise } from '@phosphor-icons/react'
import { useTenantId } from '@/lib/hooks/useTenant'

type Step = {
  variant: string
  label: string
  channel: 'instagram_dm' | 'email' | 'sms' | 'linkedin_dm'
  score_min: number
  score_max: number
  body: string
}

type Sequence = {
  id: string
  name: string
  slug: string
  description: string | null
  steps: Step[]
  is_active: boolean
  updated_at: string
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error('Failed to load templates')
    return r.json() as Promise<{ sequences: Sequence[] }>
  })

export function TemplatesPageClient() {
  const tenantId = useTenantId()
  const { data, error, isLoading, mutate } = useSWR(
    `/api/outreach/templates?tenant_id=${tenantId}`,
    fetcher,
  )

  return (
    <div className="px-3 sm:px-6 py-6 max-w-5xl">
      <div className="flex items-center gap-2 mb-3">
        <Link
          href="/dashboard/outreach"
          className="text-[12px] text-[var(--color-saul-text-secondary)] hover:text-[var(--color-saul-text-primary)] inline-flex items-center gap-1"
        >
          <ArrowLeft size={12} weight="bold" />
          Back to outreach
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-[var(--color-saul-text-primary)] tracking-tight mb-1">
        Outreach templates
      </h1>
      <p className="text-[14px] text-[var(--color-saul-text-secondary)] mb-6 max-w-2xl">
        SDRs can edit message copy and score bands without a code change. Saul
        picks the variant whose score band contains the lead&apos;s score when
        drafting.
      </p>

      {isLoading && <p className="text-[var(--color-saul-text-secondary)] text-sm">Loading…</p>}
      {error && <p className="text-rose-300 text-sm">Could not load templates.</p>}

      <div className="flex flex-col gap-6">
        {(data?.sequences ?? []).map((seq) => (
          <SequenceEditor
            key={seq.id}
            seq={seq}
            tenantId={tenantId}
            onUpdated={() => void mutate()}
          />
        ))}
      </div>

      {data && data.sequences.length === 0 && (
        <p className="text-[var(--color-saul-text-secondary)] text-sm">
          No active sequences for this tenant. Run{' '}
          <code className="text-[var(--color-saul-cyan)]">
            supabase/migrations/010_outreach_templates_seed.sql
          </code>{' '}
          and re-load.
        </p>
      )}
    </div>
  )
}

function SequenceEditor({
  seq,
  tenantId,
  onUpdated,
}: {
  seq: Sequence
  tenantId: string
  onUpdated: () => void
}) {
  const [draft, setDraft] = useState<Step[]>(seq.steps)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Detect server-side changes coming back through SWR.
  const fingerprint = useMemo(() => JSON.stringify(seq.steps), [seq.steps])
  const [lastFingerprint, setLastFingerprint] = useState(fingerprint)
  if (fingerprint !== lastFingerprint) {
    setLastFingerprint(fingerprint)
    setDraft(seq.steps)
  }

  const dirty = JSON.stringify(draft) !== fingerprint

  function updateStep(index: number, patch: Partial<Step>) {
    setDraft((cur) => cur.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  async function save() {
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch(`/api/outreach/templates/${seq.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, steps: draft }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      onUpdated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-saul-bg-800)] p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--color-saul-text-primary)]">
            {seq.name}
          </h2>
          {seq.description && (
            <p className="text-[12px] text-[var(--color-saul-text-secondary)] mt-1 max-w-xl">
              {seq.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={() => setDraft(seq.steps)}
              className="text-[12px] text-[var(--color-saul-text-secondary)] hover:text-[var(--color-saul-text-primary)] inline-flex items-center gap-1"
              disabled={saving}
            >
              <ArrowCounterClockwise size={12} weight="bold" />
              Reset
            </button>
          )}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-[6px] bg-[var(--color-saul-cyan)] text-[var(--color-saul-bg-900)] disabled:opacity-50"
          >
            <FloppyDisk size={13} weight="bold" />
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {err && (
        <p className="text-rose-300 text-[12px] mb-3">Save failed: {err}</p>
      )}

      <div className="flex flex-col gap-3">
        {draft.map((step, i) => (
          <div
            key={`${seq.id}-${step.variant}-${i}`}
            className="rounded-md border border-[rgba(255,255,255,0.06)] p-3"
          >
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-[11px] font-mono uppercase text-[var(--color-saul-cyan)]">
                {step.variant}
              </span>
              <span className="text-[12px] text-[var(--color-saul-text-secondary)] truncate">
                {step.label}
              </span>
              <span className="ml-auto text-[11px] text-[var(--color-saul-text-secondary)]">
                {step.channel}
              </span>
            </div>
            <div className="flex items-center gap-3 mb-2 text-[12px]">
              <label className="flex items-center gap-1.5">
                <span className="text-[var(--color-saul-text-secondary)]">Score min</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={step.score_min}
                  onChange={(e) => updateStep(i, { score_min: Number(e.target.value) })}
                  className="w-14 px-2 py-1 rounded-md bg-[var(--color-saul-bg-900)] border border-[rgba(255,255,255,0.08)] text-[var(--color-saul-text-primary)]"
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-[var(--color-saul-text-secondary)]">Score max</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={step.score_max}
                  onChange={(e) => updateStep(i, { score_max: Number(e.target.value) })}
                  className="w-14 px-2 py-1 rounded-md bg-[var(--color-saul-bg-900)] border border-[rgba(255,255,255,0.08)] text-[var(--color-saul-text-primary)]"
                />
              </label>
            </div>
            <textarea
              className="w-full min-h-[140px] rounded-md bg-[var(--color-saul-bg-900)] border border-[rgba(255,255,255,0.08)] p-3 text-[13px] text-[var(--color-saul-text-primary)] font-sans"
              value={step.body}
              onChange={(e) => updateStep(i, { body: e.target.value })}
            />
            <p className="text-[10px] text-[var(--color-saul-text-secondary)] mt-1">
              Variables: <code>{'{first_name}'}</code>, <code>{'{company_name}'}</code>
              {seq.slug.startsWith('medspa') && (
                <>, <code>{'{booking_note}'}</code></>
              )}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
