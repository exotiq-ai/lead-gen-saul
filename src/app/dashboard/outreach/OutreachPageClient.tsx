'use client'

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { PaperPlaneTilt, ChatCircle, NotePencil, Check, Prohibit } from '@phosphor-icons/react'
import { ApprovalCard, type QueueItem } from '@/components/outreach/ApprovalCard'
import { useTenantId } from '@/lib/hooks/useTenant'

const TABS = [
  { id: 'pending' as const, label: 'Pending' },
  { id: 'approved' as const, label: 'Approved' },
  { id: 'sent' as const, label: 'Sent' },
  { id: 'rejected' as const, label: 'Rejected' },
  { id: 'all' as const, label: 'All' },
]

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error('Failed to load')
    return r.json() as Promise<{ items: QueueItem[]; pending_count: number }>
  })

export function OutreachPageClient() {
  const tenantId = useTenantId()
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('pending')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const { data, error, isLoading, mutate } = useSWR(
    `/api/outreach/queue?tenant_id=${tenantId}&status=${tab}&limit=200`,
    fetcher,
    { revalidateOnFocus: true, refreshInterval: 15_000 },
  )

  const items = data?.items ?? []
  const pendingCount = data?.pending_count ?? 0

  const pendingIdsInView = useMemo(
    () => items.filter((i) => i.status === 'pending').map((i) => i.id),
    [items],
  )

  // Reset selection when the view changes (tab switch / data refresh removes
  // a row). Tracks the visible-pending fingerprint, not the wider items
  // list, so SWR refresh that adds new rows doesn't drop existing checks.
  const visibleFingerprint = pendingIdsInView.join(',')
  const [lastFingerprint, setLastFingerprint] = useState(visibleFingerprint)
  if (visibleFingerprint !== lastFingerprint) {
    setLastFingerprint(visibleFingerprint)
    // Drop selections that disappeared from the view.
    const visibleSet = new Set(pendingIdsInView)
    let changed = false
    const next = new Set<string>()
    for (const id of selected) {
      if (visibleSet.has(id)) next.add(id)
      else changed = true
    }
    if (changed) setSelected(next)
  }

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllVisible() {
    setSelected(new Set(pendingIdsInView))
  }
  function clearSelection() {
    setSelected(new Set())
  }

  async function bulk(action: 'approve' | 'reject') {
    if (selected.size === 0) return
    if (
      !window.confirm(
        `${action === 'approve' ? 'Approve' : 'Reject'} ${selected.size} message${
          selected.size === 1 ? '' : 's'
        }?`,
      )
    )
      return
    setBulkBusy(true)
    try {
      const res = await fetch('/api/outreach/queue/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          action,
          queue_ids: Array.from(selected),
          reviewed_by: 'gregory',
        }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; affected?: number }
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      clearSelection()
      void mutate()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Bulk update failed')
    } finally {
      setBulkBusy(false)
    }
  }

  const allVisibleSelected =
    pendingIdsInView.length > 0 && selected.size >= pendingIdsInView.length

  return (
    <div className="px-6 py-6 max-w-5xl">
      <motion.header
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-1">
          <PaperPlaneTilt size={28} className="text-[var(--color-saul-cyan)]" weight="duotone" />
          <h1 className="text-2xl font-bold text-[var(--color-saul-text-primary)] tracking-tight">
            Outreach approval
          </h1>
          <Link
            href="/dashboard/outreach/templates"
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-[6px] border border-[rgba(255,255,255,0.08)] text-[var(--color-saul-text-secondary)] hover:border-[rgba(0,212,170,0.3)] hover:text-[var(--color-saul-text-primary)]"
          >
            <NotePencil size={14} weight="bold" />
            Templates
          </Link>
        </div>
        <p className="text-[14px] text-[var(--color-saul-text-secondary)] max-w-2xl">
          Review messages drafted by Saul before they go out via GHL. Approve, edit, or reject — human-in-the-loop for every client.
        </p>
        <div className="mt-4 flex items-center gap-2 text-[12px] text-[var(--color-saul-text-secondary)]">
          <ChatCircle size={16} />
          <span>
            <strong className="text-[var(--color-saul-cyan)]">{pendingCount}</strong> pending in queue
          </span>
        </div>
      </motion.header>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id)
              clearSelection()
            }}
            className={[
              'px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors',
              tab === t.id
                ? 'bg-[var(--color-saul-cyan)]/20 text-[var(--color-saul-cyan)] border border-[var(--color-saul-cyan)]/40'
                : 'bg-[var(--color-saul-bg-700)] text-[var(--color-saul-text-secondary)] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.1)]',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Bulk actions bar -- shown when there are selectable items in view */}
      {pendingIdsInView.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 p-2 rounded-md border border-[rgba(255,255,255,0.06)] bg-[var(--color-saul-bg-800)]">
          <label className="flex items-center gap-1.5 text-[12px] text-[var(--color-saul-text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(e) => (e.target.checked ? selectAllVisible() : clearSelection())}
              className="accent-[var(--color-saul-cyan)]"
            />
            Select all visible pending ({pendingIdsInView.length})
          </label>
          <span className="text-[12px] text-[var(--color-saul-text-secondary)]">
            {selected.size} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => bulk('approve')}
              disabled={selected.size === 0 || bulkBusy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[var(--color-saul-cyan)]/20 text-[var(--color-saul-cyan)] border border-[var(--color-saul-cyan)]/30 disabled:opacity-40"
            >
              <Check size={13} weight="bold" />
              Approve selected
            </button>
            <button
              onClick={() => bulk('reject')}
              disabled={selected.size === 0 || bulkBusy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-md bg-rose-500/15 text-rose-200 border border-rose-500/25 disabled:opacity-40"
            >
              <Prohibit size={13} weight="bold" />
              Reject selected
            </button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-40 rounded-lg bg-[var(--color-saul-bg-800)] border border-[rgba(255,255,255,0.05)] skeleton-shimmer"
            />
          ))}
        </div>
      )}

      {error && (
        <p className="text-rose-300 text-sm">
          Could not load queue. Run Supabase migration <code className="text-[var(--color-saul-cyan)]">006_outreach_schema.sql</code> and re-seed.
        </p>
      )}

      {!isLoading && !error && items.length === 0 && (
        <p className="text-[var(--color-saul-text-secondary)] text-sm">No items in this view.</p>
      )}

      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <ApprovalCard
            key={item.id}
            item={item}
            tenantId={tenantId}
            onUpdated={() => void mutate()}
            selectable={item.status === 'pending'}
            selected={selected.has(item.id)}
            onToggleSelect={() => toggle(item.id)}
          />
        ))}
      </div>
    </div>
  )
}
