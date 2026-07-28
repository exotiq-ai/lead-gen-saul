'use client'

import { useEffect, useState } from 'react'

type DeliveryEvent = {
  id: string
  event_type: string
  status: string
  received_at: string
  quarantine_reason: string | null
}

type DeliveryLedgerRow = {
  id: string
  sequence_step: number
  mode: string
  status: string
  subject: string | null
  provider_message_id: string | null
  error_detail: string | null
  attempted_at: string | null
  accepted_at: string | null
  delivered_at: string | null
  contact_name: string | null
  company_name: string | null
  recipient: string | null
  ghl_contact_url: string | null
  latest_event: DeliveryEvent | null
  events: DeliveryEvent[]
}

type SequenceStatus = {
  summary: {
    enrollments: { total: number; by_status: Record<string, number>; by_mode: Record<string, number> }
    actions: { total: number; by_status: Record<string, number>; overdue_pending: number }
    email_attempts: { total: number; provider_handoffs: number; delivered: number; failed: number; hard_bounced: number; complained: number }
    events: { total: number; quarantined: number; replies: number; appointments: number; opportunities: number }
    active_suppressions: number
  }
  customer_enrollment_enabled: boolean
  customer_sending_enabled: boolean
  demo_sending_enabled: boolean
  test_customer_email: string | null
  test_customer_configured: boolean
  daily_email_cap: number
  live_email_attempts_today: number
  quarantined_events: number
  delivery_ledger: DeliveryLedgerRow[]
}

function timestamp(value: string | null) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value
}

function statusClass(status: string) {
  if (['delivered', 'processed', 'completed', 'provider_accepted'].includes(status)) return 'bg-[#e6f2d4] text-[#35531d]'
  if (['failed', 'hard_bounced', 'complained', 'quarantined'].includes(status)) return 'bg-[#fee3dc] text-[#8a2f23]'
  return 'bg-[#eef0ea] text-[#526157]'
}

export function SequenceOperationsPanel() {
  const [data, setData] = useState<SequenceStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/outreach/sequences/status', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as SequenceStatus & { error?: string }
        if (!response.ok) throw new Error(body.error || `Status API returned ${response.status}`)
        return body
      })
      .then((body) => { if (active) setData(body) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Status readback failed') })
    return () => { active = false }
  }, [])

  if (error) {
    return <section className="mt-8 rounded-2xl border border-[#edb8ad] bg-[#fff3ef] p-5 text-sm text-[#7c2e23]">Live operations readback failed: {error}</section>
  }
  if (!data) {
    return <section className="mt-8 rounded-2xl border border-[#d8dfd6] bg-[#fffdf8] p-5 text-sm text-[#5b695f]">Loading live delivery and safety readback…</section>
  }

  const gates = [
    { label: 'Customer enrollment', safe: !data.customer_enrollment_enabled, value: data.customer_enrollment_enabled ? 'UNLOCKED' : 'LOCKED' },
    { label: 'Customer sending', safe: !data.customer_sending_enabled, value: data.customer_sending_enabled ? 'UNLOCKED' : 'LOCKED' },
    { label: 'Test sending', safe: !data.demo_sending_enabled, value: data.demo_sending_enabled ? 'UNLOCKED' : 'LOCKED' },
    { label: 'Test customer', safe: data.test_customer_configured, value: data.test_customer_email || 'NOT SET' },
  ]

  return (
    <section className="mt-8 space-y-5" aria-label="Live sequence operations">
      <div className="rounded-2xl border border-[#d8dfd6] bg-[#fffdf8] p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#6d7e55]">Live safety readback</p>
            <h2 className="mt-2 text-2xl font-semibold">Infrastructure on, outbound off</h2>
          </div>
          <span className="rounded-full bg-[#e6f2d4] px-3 py-1 text-xs font-bold text-[#35531d]">SAFE HOLD</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {gates.map((gate) => (
            <div key={gate.label} className="rounded-xl bg-[#f3f5ef] p-4">
              <p className="text-xs font-semibold text-[#667268]">{gate.label}</p>
              <p className={`mt-2 break-all text-sm font-bold ${gate.safe ? 'text-[#35531d]' : 'text-[#9a3326]'}`}>{gate.safe ? '● ' : '▲ '}{gate.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Enrollments" value={data.summary.enrollments.total} detail={`${data.summary.enrollments.by_status.active || 0} active`} />
        <Metric label="Provider handoffs" value={data.summary.email_attempts.provider_handoffs} detail={`${data.summary.email_attempts.delivered} delivered · ${data.live_email_attempts_today}/${data.daily_email_cap} live today`} />
        <Metric label="Sequence actions" value={data.summary.actions.total} detail={`${data.summary.actions.overdue_pending} overdue`} />
        <Metric label="Exit events" value={data.summary.events.replies + data.summary.events.appointments + data.summary.events.opportunities} detail={`${data.summary.active_suppressions} suppressions · ${data.quarantined_events} quarantined`} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#d8dfd6] bg-[#fffdf8]">
        <div className="border-b border-[#e0e5de] px-5 py-5 sm:px-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#6d7e55]">Delivery ledger</p>
          <h2 className="mt-2 text-2xl font-semibold">Every Resend handoff and webhook event</h2>
          <p className="mt-2 text-sm text-[#5b695f]">Provider acceptance is not inbox placement. “Delivered” means the recipient mail server accepted the message.</p>
        </div>
        {data.delivery_ledger.length === 0 ? (
          <p className="px-5 py-8 text-sm text-[#5b695f]">No sequence email attempts are recorded yet.</p>
        ) : (
          <div className="divide-y divide-[#e0e5de]">
            {data.delivery_ledger.map((row) => (
              <article key={row.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[0.75fr_1.5fr_0.8fr] lg:px-7">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${statusClass(row.status)}`}>{row.status.replaceAll('_', ' ')}</span>
                    <span className="rounded-full bg-[#eef0ea] px-2.5 py-1 text-[11px] font-bold uppercase text-[#526157]">{row.mode} · step {row.sequence_step}</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold">{row.company_name || row.contact_name || 'Unknown contact'}</p>
                  <p className="mt-1 break-all text-xs text-[#6a766e]">{row.recipient || 'Recipient unavailable'}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold">{row.subject || 'Subject unavailable'}</p>
                  <p className="mt-2 text-xs text-[#6a766e]">Attempted {timestamp(row.attempted_at)}</p>
                  <p className="mt-1 text-xs text-[#6a766e]">Latest provider event: <strong>{row.latest_event?.event_type.replaceAll('_', ' ') || 'none'}</strong></p>
                  {row.error_detail ? <p className="mt-2 text-xs text-[#9a3326]">{row.error_detail}</p> : null}
                </div>
                <div className="flex flex-col items-start gap-2 lg:items-end">
                  {row.ghl_contact_url ? <a href={row.ghl_contact_url} target="_blank" rel="noreferrer" className="rounded-full border border-[#b9c6bd] bg-white px-3 py-1.5 text-xs font-semibold hover:bg-[#f3f5ef]">Open GHL contact ↗</a> : null}
                  <p className="max-w-full break-all text-[10px] text-[#8a948d]">{row.provider_message_id || 'No provider message id'}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-[#d8dfd6] bg-[#fffdf8] p-5">
      <p className="text-xs font-semibold text-[#667268]">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-[#7c877f]">{detail}</p>
    </div>
  )
}
