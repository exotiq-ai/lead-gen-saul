import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseQuery } from '@/lib/validation/parse'
import { agentsDashboardQuerySchema } from '@/lib/validation/schemas'

export const runtime = 'nodejs'

const AGENT_TYPES = [
  'orchestrator',
  'sourcing',
  'enrichment',
  'scoring',
  'outreach',
  'qualifier',
] as const

const MS = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

export async function GET(req: NextRequest) {
  const parsed = parseQuery(agentsDashboardQuerySchema, req.nextUrl)
  if (!parsed.success) return parsed.response
  const { tenant_id: tenantId, range } = parsed.data

  const since =
    range === 'all'
      ? null
      : new Date(Date.now() - (MS[range] ?? MS['7d'])).toISOString()

  const supabase = createServerClient()
  let q = supabase
    .from('agent_runs')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('started_at', { ascending: false })
    .limit(200)
  if (since) {
    q = q.gte('started_at', since)
  }
  const { data: runs, error } = await q

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = runs ?? []
  const byType: Record<string, typeof rows> = {}
  for (const t of AGENT_TYPES) byType[t] = []
  for (const r of rows) {
    const t = (r as { agent_type: string }).agent_type
    if (!byType[t]) byType[t] = []
    byType[t].push(r)
  }

  const latest = (arr: typeof rows) =>
    arr[0] as
      | {
          started_at: string
          completed_at: string | null
          status: string
          duration_ms: number | null
          tokens_used: number
          cost_cents: number
        }
      | undefined

  const lastRun = rows[0] as
    | { started_at: string; completed_at: string | null }
    | undefined
  const lastHeartbeat = lastRun?.completed_at || lastRun?.started_at || null

  // Status is "online" iff the last heartbeat is within the cron interval
  // plus a 5min grace. Otherwise we surface "stale" (within 6h) or
  // "offline". Hard-coded "online" was lying to the user when the python
  // service had crashed (e.g. discover.py syntax error before Stage 0d).
  const HEARTBEAT_HORIZON_MS = (15 + 5) * 60 * 1000
  const STALE_HORIZON_MS = 6 * 60 * 60 * 1000
  let gatewayStatus: 'online' | 'stale' | 'offline'
  if (!lastHeartbeat) {
    gatewayStatus = 'offline'
  } else {
    const ageMs = Date.now() - new Date(lastHeartbeat).getTime()
    if (ageMs <= HEARTBEAT_HORIZON_MS) gatewayStatus = 'online'
    else if (ageMs <= STALE_HORIZON_MS) gatewayStatus = 'stale'
    else gatewayStatus = 'offline'
  }

  return NextResponse.json({
    gateway: {
      status: gatewayStatus,
      protocol: 'OpenClaw WebSocket (Gateway)',
      // null when we genuinely have no signal -- callers should render
      // a dash, not a faked "now".
      last_heartbeat: lastHeartbeat,
      model: process.env.SAUL_MODEL_NAME || 'claude-sonnet-4',
    },
    cron: {
      interval_minutes: 15,
      next_run_at: nextQuarterHour(),
    },
    agent_cards: AGENT_TYPES.map((type) => {
      const list = byType[type] || []
      const l = latest(list)
      const completed = list.filter((x) => (x as { status: string }).status === 'completed')
      const successRate =
        list.length > 0 ? Math.round((completed.length / list.length) * 100) : 0
      const tokens = list.reduce((a, b) => a + ((b as { tokens_used?: number }).tokens_used || 0), 0)
      return {
        agent_type: type,
        status: l ? (l.status === 'running' ? 'running' : l.status === 'failed' ? 'error' : 'idle') : 'idle',
        last_run_at: l?.started_at ?? null,
        duration_ms: l?.duration_ms ?? null,
        success_rate: successRate,
        tokens_total: tokens,
        runs: list.length,
      }
    }),
    recent_runs: rows.slice(0, 40),
  })
}

function nextQuarterHour(): string {
  const d = new Date()
  const m = d.getMinutes()
  const add = 15 - (m % 15) || 15
  d.setMinutes(m + add, 0, 0)
  return d.toISOString()
}
