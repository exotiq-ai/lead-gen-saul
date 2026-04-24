'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { motion } from 'framer-motion'
import { PaperPlaneTilt, ChatCircle } from '@phosphor-icons/react'
import { ApprovalCard, type QueueItem } from '@/components/outreach/ApprovalCard'

const TENANT = '00000000-0000-0000-0000-000000000001'

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
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('pending')

  const { data, error, isLoading, mutate } = useSWR(
    `/api/outreach/queue?tenant_id=${TENANT}&status=${tab}&limit=200`,
    fetcher,
    { revalidateOnFocus: true },
  )

  const items = data?.items ?? []
  const pendingCount = data?.pending_count ?? 0

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

      <div className="flex flex-wrap gap-1.5 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
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
          <ApprovalCard key={item.id} item={item} tenantId={TENANT} onUpdated={() => void mutate()} />
        ))}
      </div>
    </div>
  )
}
