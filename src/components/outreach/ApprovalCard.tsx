'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Check, PencilSimple, Prohibit, PaperPlaneTilt } from '@phosphor-icons/react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

export type QueueItem = {
  id: string
  lead_id: string
  channel: string
  message_draft: string
  status: string
  generated_by: string | null
  reviewed_by: string | null
  approved_at: string | null
  sent_at: string | null
  created_at: string
  leads: {
    company_name: string | null
    score: number | null
    first_name: string | null
    last_name: string | null
    company_location: string | null
    assigned_to: string | null
  } | null
}

const CHANNEL_LABEL: Record<string, string> = {
  instagram_dm: 'IG DM',
  email: 'Email',
  phone: 'Phone',
  sms: 'SMS',
  linkedin_dm: 'LinkedIn',
}

function channelLabel(ch: string) {
  return CHANNEL_LABEL[ch] ?? ch
}

export function ApprovalCard({
  item,
  tenantId,
  onUpdated,
}: {
  item: QueueItem
  tenantId: string
  onUpdated: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.message_draft)
  const [loading, setLoading] = useState(false)
  const lead = item.leads
  const title =
    [lead?.first_name, lead?.last_name].filter(Boolean).join(' ') ||
    lead?.company_name ||
    'Lead'

  async function patch(
    action: 'approve' | 'reject' | 'edit' | 'mark_sent',
    extra?: { message_draft?: string },
  ) {
    setLoading(true)
    try {
      const res = await fetch(`/api/outreach/queue/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          action,
          message_draft: extra?.message_draft,
          reviewed_by: 'gregory',
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? 'Request failed')
      }
      onUpdated()
      setEditing(false)
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.article
      layout
      className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-saul-bg-800)] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/dashboard/leads/${item.lead_id}`}
              className="text-[15px] font-semibold text-[var(--color-saul-text-primary)] hover:text-[var(--color-saul-cyan)]"
            >
              {title}
            </Link>
            {lead?.company_name && (
              <span className="text-[13px] text-[var(--color-saul-text-secondary)]">
                {lead.company_name}
              </span>
            )}
          </div>
          {lead?.company_location && (
            <p className="text-[12px] text-[var(--color-saul-text-secondary)] mt-0.5">
              {lead.company_location}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <Badge className="font-mono text-[10px]">{channelLabel(item.channel)}</Badge>
          {lead?.score != null && (
            <span className="text-[12px] font-mono text-[var(--color-saul-cyan)]">★ {lead.score}</span>
          )}
          <Badge
            className={[
              'text-[10px]',
              item.status === 'pending' && 'bg-amber-500/15 text-amber-200',
              item.status === 'approved' && 'bg-emerald-500/15 text-emerald-200',
              item.status === 'sent' && 'bg-slate-500/20 text-slate-200',
              item.status === 'rejected' && 'bg-rose-500/15 text-rose-200',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {item.status}
          </Badge>
        </div>
      </div>

      {editing ? (
        <textarea
          className="w-full min-h-[120px] rounded-md bg-[var(--color-saul-bg-900)] border border-[rgba(255,255,255,0.1)] p-3 text-[13px] text-[var(--color-saul-text-primary)] font-sans"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      ) : (
        <p className="text-[13px] text-[var(--color-saul-text-primary)]/90 leading-relaxed whitespace-pre-wrap">
          {item.message_draft}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-4">
        {item.status === 'pending' && !editing && (
          <>
            <Button size="sm" onClick={() => {
              if (!window.confirm(`Approve this outreach to ${title}? It will be queued for send.`)) return
              void patch('approve')
            }} disabled={loading} className="gap-1.5">
              <Check size={16} weight="bold" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              disabled={loading}
              className="gap-1.5"
            >
              <PencilSimple size={16} weight="bold" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (!window.confirm(`Reject this outreach to ${title}? This cannot be undone.`)) return
                void patch('reject')
              }}
              disabled={loading}
              className="gap-1.5 text-rose-300"
            >
              <Prohibit size={16} weight="bold" />
              Reject
            </Button>
          </>
        )}
        {editing && (
          <>
            <Button
              size="sm"
              onClick={() => void patch('edit', { message_draft: draft })}
              disabled={loading}
            >
              Save draft
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={loading}>
              Cancel
            </Button>
          </>
        )}
        {item.status === 'approved' && (
          <Button
            size="sm"
            onClick={() => {
              if (!window.confirm(`Mark as sent via GHL? Make sure the message was actually delivered.`)) return
              void patch('mark_sent')
            }}
            disabled={loading}
            className="gap-1.5"
          >
            <PaperPlaneTilt size={16} weight="bold" />
            Mark sent (GHL)
          </Button>
        )}
      </div>
    </motion.article>
  )
}
