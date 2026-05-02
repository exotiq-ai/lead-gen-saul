'use client'

import { useState, useEffect, useRef } from 'react'
import useSWR from 'swr'
import { motion } from 'framer-motion'
import { Robot, Pulse, Timer, Plugs, Cpu, Broadcast } from '@phosphor-icons/react'
import { formatDistanceToNow } from 'date-fns'
import { useTenantId } from '@/lib/hooks/useTenant'

const SOUL_EXCERPT = `## Voice
- Direct. No corporate filler. One sentence when one sentence is enough.
- You protect Exotiq's time: tier-5 / Gregory-only leads are sacred.
- You flag junk (dealerships, brokers, sub-5 fleet) without drama — then move on.

## Operating mode
- OpenClaw Gateway: you own the session lane; tools are your hands; Supabase is the world state.
- Sub-agents for parallel work; you merge their outputs into one truth in the DB.

## Hard rules
- Never ship outreach without human approval in \`outreach_queue\` (status pending).
- Every lead change → log to lead_activities; re-score when engagement changes.`

const AGENT_LABEL: Record<string, string> = {
  orchestrator: 'Saul — Orchestrator',
  sourcing: 'Sourcing',
  enrichment: 'Enrichment',
  scoring: 'Scoring',
  outreach: 'Outreach',
  qualifier: 'Qualifier',
}

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error('load failed')
  return r.json()
})

type RunRow = {
  id: string
  agent_type: string
  status: string
  input_data: unknown
  output_data: unknown
  started_at: string
  completed_at: string | null
  leads_processed: number
  tokens_used: number
  duration_ms: number | null
  error_message: string | null
}

type ApiAgents = {
  gateway: {
    status: 'online' | 'stale' | 'offline' | string
    last_heartbeat: string | null
    model: string
    protocol: string
  }
  cron: { interval_minutes: number; next_run_at: string }
  agent_cards: Array<{
    agent_type: string
    status: string
    last_run_at: string | null
    duration_ms: number | null
    success_rate: number
    tokens_total: number
    runs: number
  }>
  recent_runs: RunRow[]
}

export function AgentsPageClient() {
  const tenantId = useTenantId()
  const [range, setRange] = useState<'1h' | '24h' | '7d' | '30d' | 'all'>('7d')
  const { data, error, isLoading } = useSWR<ApiAgents>(
    `/api/dashboard/agents?tenant_id=${tenantId}&range=${range}`,
    fetcher,
  )

  // Stage 4c: live SSE stream of new agent_runs. The buffer holds the
  // most recent 50 events; old ones drop off.
  const [liveEvents, setLiveEvents] = useState<Array<RunRow & { __live: true }>>([])
  const [streamConnected, setStreamConnected] = useState(false)
  const sourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const es = new EventSource(`/api/dashboard/agents/stream?tenant_id=${tenantId}`)
    sourceRef.current = es
    es.addEventListener('hello', () => setStreamConnected(true))
    es.addEventListener('run', (ev: MessageEvent<string>) => {
      try {
        const row = JSON.parse(ev.data) as RunRow
        setLiveEvents((cur) => [{ ...row, __live: true as const }, ...cur].slice(0, 50))
      } catch {
        // ignore malformed payload
      }
    })
    es.addEventListener('error', () => setStreamConnected(false))
    return () => {
      es.close()
      sourceRef.current = null
    }
  }, [tenantId])

  const nextRun = data?.cron?.next_run_at
    ? formatDistanceToNow(new Date(data.cron.next_run_at), { addSuffix: true })
    : '—'

  return (
    <div className="px-4 md:px-6 py-6 flex flex-col xl:flex-row gap-6 max-w-[1600px] mx-auto">
      <div className="flex-1 min-w-0 space-y-6">
        <header>
          <div className="flex items-center gap-2 mb-1">
            <Robot className="text-[var(--color-saul-cyan)]" size={32} weight="duotone" />
            <h1 className="text-2xl font-bold text-[var(--color-saul-text-primary)] font-mono tracking-tight">
              OpenClaw — Saul layer
            </h1>
          </div>
          <p className="text-[14px] text-[var(--color-saul-text-secondary)] max-w-2xl">
            Gateway status, sub-agent health, and run log. Mirrors the OpenClaw agent loop: lifecycle → tool stream → persistence in Supabase.
          </p>
        </header>

        {/* Gateway bar */}
        {(() => {
          const status = data?.gateway?.status ?? 'offline'
          const tone =
            status === 'online'
              ? {
                  border: 'border-[rgba(0,212,170,0.2)]',
                  bg: 'bg-[rgba(0,212,170,0.05)]',
                  pillBg: 'bg-emerald-400',
                  pillText: 'text-emerald-300',
                  pulse: 'animate-pulse',
                }
              : status === 'stale'
                ? {
                    border: 'border-amber-400/25',
                    bg: 'bg-amber-400/5',
                    pillBg: 'bg-amber-400',
                    pillText: 'text-amber-200',
                    pulse: '',
                  }
                : {
                    border: 'border-rose-400/25',
                    bg: 'bg-rose-400/5',
                    pillBg: 'bg-rose-400',
                    pillText: 'text-rose-200',
                    pulse: '',
                  }
          return (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex flex-wrap items-center gap-3 rounded-lg border ${tone.border} ${tone.bg} px-4 py-3`}
            >
              <Plugs size={22} className="text-[var(--color-saul-cyan)]" weight="duotone" />
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1.5 text-[12px] font-mono ${tone.pillText}`}>
                  <span className={`w-2 h-2 rounded-full ${tone.pillBg} ${tone.pulse}`} />
                  {status}
                </span>
                <span className="text-[11px] text-[var(--color-saul-text-secondary)]">
                  {data?.gateway?.protocol}
                </span>
              </div>
              <div className="h-4 w-px bg-[rgba(255,255,255,0.1)] hidden sm:block" />
              <div className="text-[12px] text-[var(--color-saul-text-secondary)]">
                <span className="text-[var(--color-saul-text-primary)]/80">Model</span>{' '}
                <code className="text-[var(--color-saul-cyan)] text-[11px]">
                  {data?.gateway?.model ?? '—'}
                </code>
              </div>
              <div className="text-[12px] text-[var(--color-saul-text-secondary)]">
                <Pulse className="inline mr-1 -mt-0.5" size={14} />
                Last heartbeat:{' '}
                <span className="text-[var(--color-saul-text-primary)]">
                  {data?.gateway?.last_heartbeat
                    ? formatDistanceToNow(new Date(data.gateway.last_heartbeat), { addSuffix: true })
                    : 'never'}
                </span>
              </div>
            </motion.div>
          )
        })()}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[12px] text-[var(--color-saul-text-secondary)] flex items-center gap-1">
            <Timer size={14} />
            <span>Heartbeat every {data?.cron?.interval_minutes ?? 15} min — next: {nextRun}</span>
          </div>
          <select
            className="bg-[var(--color-saul-bg-800)] border border-[rgba(255,255,255,0.1)] rounded-md text-[12px] px-2 py-1 text-[var(--color-saul-text-primary)]"
            value={range}
            onChange={(e) => setRange(e.target.value as typeof range)}
          >
            <option value="1h">1h</option>
            <option value="24h">24h</option>
            <option value="7d">7d</option>
            <option value="30d">30d</option>
            <option value="all">all</option>
          </select>
        </div>

        {isLoading && <div className="h-32 skeleton-shimmer rounded-lg" />}
        {error && <p className="text-rose-300 text-sm">Could not load agents</p>}

        {/* 6 cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {(data?.agent_cards ?? []).map((card) => (
            <motion.div
              key={card.agent_type}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-saul-bg-800)] p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-[11px] font-mono uppercase text-[var(--color-saul-text-secondary)]">
                    {AGENT_LABEL[card.agent_type] ?? card.agent_type}
                  </p>
                  <p className="text-[10px] text-[var(--color-saul-text-secondary)]">
                    {card.runs} run{card.runs === 1 ? '' : 's'} in window
                  </p>
                </div>
                <StatusDot status={card.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-[var(--color-saul-text-secondary)]">
                <div>Success: {card.success_rate}%</div>
                <div>Tokens: {card.tokens_total.toLocaleString()}</div>
                <div>
                  Last:{' '}
                  {card.last_run_at
                    ? formatDistanceToNow(new Date(card.last_run_at), { addSuffix: true })
                    : '—'}
                </div>
                <div>Duration: {card.duration_ms != null ? `${card.duration_ms}ms` : '—'}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Run log */}
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--color-saul-text-primary)] mb-2 flex items-center gap-2">
            <Cpu size={18} className="text-[var(--color-saul-cyan)]" />
            Run log
            <span
              className={[
                'ml-2 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wide',
                streamConnected ? 'text-emerald-300' : 'text-[var(--color-saul-text-tertiary)]',
              ].join(' ')}
              title={streamConnected ? 'live stream connected' : 'no live stream'}
            >
              <Broadcast size={11} weight={streamConnected ? 'fill' : 'regular'} />
              {streamConnected ? 'live' : 'polling'}
            </span>
          </h2>
          <div className="overflow-x-auto rounded-lg border border-[rgba(255,255,255,0.08)]">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.06)] text-[var(--color-saul-text-secondary)]">
                  <th className="p-2 font-medium">Type</th>
                  <th className="p-2 font-medium">Status</th>
                  <th className="p-2 font-medium">Leads</th>
                  <th className="p-2 font-medium">Tokens</th>
                  <th className="p-2 font-medium">Duration</th>
                  <th className="p-2 font-medium">Started</th>
                </tr>
              </thead>
              <tbody>
                {/* Live events (from SSE) render first with a subtle bg
                    so the operator can see them flowing in. We dedup
                    against the SWR snapshot by id since the polling
                    stream may overlap with the periodic /agents fetch. */}
                {(() => {
                  const polled = data?.recent_runs ?? []
                  const polledIds = new Set(polled.map((r) => r.id))
                  const liveOnly = liveEvents.filter((r) => !polledIds.has(r.id))
                  const merged: Array<RunRow & { __live?: true }> = [...liveOnly, ...polled]
                  if (merged.length === 0) return null
                  return merged.slice(0, 60).map((r) => (
                    <tr
                      key={r.id}
                      className={[
                        'border-b border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)]',
                        r.__live ? 'bg-[rgba(0,212,170,0.04)]' : '',
                      ].join(' ')}
                    >
                      <td className="p-2 font-mono text-[var(--color-saul-cyan)]">
                        {r.agent_type}
                        {r.__live && <span className="ml-1 text-[9px] uppercase text-emerald-300">live</span>}
                      </td>
                      <td className="p-2">{r.status}</td>
                      <td className="p-2">{r.leads_processed}</td>
                      <td className="p-2">{r.tokens_used}</td>
                      <td className="p-2">{r.duration_ms ?? '—'}</td>
                      <td className="p-2 text-[var(--color-saul-text-secondary)]">
                        {r.started_at ? new Date(r.started_at).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
            {(!data?.recent_runs || data.recent_runs.length === 0) &&
              liveEvents.length === 0 &&
              !isLoading && (
                <p className="p-6 text-center text-[var(--color-saul-text-secondary)] text-[13px]">
                  No agent runs yet. When Saul and workers execute, they appear here.
                </p>
              )}
          </div>
        </div>
      </div>

      {/* SOUL.md rail */}
      <aside className="w-full xl:w-[380px] shrink-0">
        <div className="sticky top-6 rounded-lg border border-[rgba(0,212,170,0.15)] bg-[var(--color-saul-bg-900)] overflow-hidden">
          <div className="px-3 py-2 border-b border-[rgba(0,212,170,0.1)] flex items-center justify-between bg-[rgba(0,212,170,0.06)]">
            <span className="text-[11px] font-mono text-[var(--color-saul-cyan)]">SOUL.md</span>
            <span className="text-[10px] text-[var(--color-saul-text-secondary)]">OpenClaw personality</span>
          </div>
          <pre className="p-4 text-[11px] leading-relaxed text-[var(--color-saul-text-primary)]/90 font-mono whitespace-pre-wrap max-h-[70vh] overflow-y-auto">
            {SOUL_EXCERPT}
          </pre>
        </div>
      </aside>
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const c =
    status === 'running'
      ? 'bg-amber-400'
      : status === 'error'
        ? 'bg-rose-400'
        : 'bg-emerald-400'
  return <span className={`w-2.5 h-2.5 rounded-full ${c} shrink-0 mt-0.5`} title={status} />
}
