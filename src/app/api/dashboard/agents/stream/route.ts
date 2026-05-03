import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseQuery } from '@/lib/validation/parse'
import { agentsDashboardQuerySchema } from '@/lib/validation/schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/dashboard/agents/stream?tenant_id=...
//
// Server-Sent Events stream of agent_runs rows. We poll Supabase every
// 5 seconds (the python orchestrator runs every 15min so 5s is generous)
// and emit any rows we haven't sent yet. The dashboard subscribes via
// EventSource and renders new rows live without a manual refresh.
//
// Why polling vs Realtime channels: Supabase Realtime requires the
// REPLICA IDENTITY FULL plus a publication on agent_runs which neither
// 001 nor 008 set up. Polling is simpler, cheaper for our cadence, and
// works through whatever proxy is between Netlify and Supabase. When
// realtime is wired (3d / SSO timeline) we can switch.
export async function GET(req: NextRequest) {
  const parsed = parseQuery(agentsDashboardQuerySchema, req.nextUrl)
  if (!parsed.success) return parsed.response
  const { tenant_id: tenantId } = parsed.data

  const supabase = createServerClient()
  const encoder = new TextEncoder()

  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null
  // Track last-seen `started_at` so we only emit new rows. ISO strings
  // sort lexicographically so '>' works.
  let cursor: string = new Date().toISOString()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(event: string, payload: unknown) {
        if (cancelled) return
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`),
          )
        } catch {
          // controller closed by client; we'll bail on next tick.
          cancelled = true
        }
      }

      // Greeting tells the client we're connected; useful for debugging
      // a silent stream.
      send('hello', { tenant_id: tenantId, since: cursor })

      async function tick() {
        if (cancelled) return
        try {
          const { data, error } = await supabase
            .from('agent_runs')
            .select(
              'id, agent_type, status, started_at, completed_at, duration_ms, leads_processed, tokens_used, cost_cents, output_data',
            )
            .eq('tenant_id', tenantId)
            .gt('started_at', cursor)
            .order('started_at', { ascending: true })
            .limit(50)

          if (error) {
            send('error', { message: error.message })
          } else if (data && data.length > 0) {
            for (const row of data) {
              send('run', row)
            }
            cursor = data[data.length - 1].started_at as string
          }
        } catch (e) {
          send('error', { message: e instanceof Error ? e.message : 'tick failed' })
        }
        // Heartbeat comment keeps proxies from closing the stream.
        if (!cancelled) {
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`))
          } catch {
            cancelled = true
          }
        }
        if (!cancelled) timer = setTimeout(tick, 5_000)
      }
      timer = setTimeout(tick, 1_000)
    },
    cancel() {
      cancelled = true
      if (timer) clearTimeout(timer)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
