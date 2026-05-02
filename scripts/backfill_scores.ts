/**
 * scripts/backfill_scores.ts
 *
 * Re-score every lead via the same TS engine the API uses
 * (src/lib/scoring/engine.ts). Necessary one-time fix-up because the
 * Exotiq migration mapped 5-tier ratings to score = 100/80/60/40/20 and
 * never invoked the real composite calc, so the score distribution on
 * the dashboard is currently a step function rather than real signal.
 *
 * Usage:
 *   tsx scripts/backfill_scores.ts                        # both tenants
 *   tsx scripts/backfill_scores.ts --tenant-id=...        # one tenant
 *   tsx scripts/backfill_scores.ts --rate=5               # 5 leads/sec
 *   tsx scripts/backfill_scores.ts --dry-run              # don't write
 *   tsx scripts/backfill_scores.ts --only-missing-composite
 *                                                         # skip leads
 *                                                         # whose
 *                                                         # score_breakdown
 *                                                         # already has a
 *                                                         # `composite`
 *                                                         # field
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env (or load
 * via .env.local — dotenv is included in devDependencies).
 */

import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import path from 'node:path'

import { calculateScore } from '../src/lib/scoring/engine'

// Load .env.local from the repo root so the same env that powers
// the Next dev server works here.
loadEnv({ path: path.resolve(process.cwd(), '.env.local') })
loadEnv({ path: path.resolve(process.cwd(), '.env') })

type Args = {
  tenantId: string | null
  ratePerSec: number
  dryRun: boolean
  onlyMissingComposite: boolean
}

function parseArgs(): Args {
  const args: Args = {
    tenantId: null,
    ratePerSec: 10,
    dryRun: false,
    onlyMissingComposite: false,
  }
  for (const raw of process.argv.slice(2)) {
    if (raw === '--dry-run') args.dryRun = true
    else if (raw === '--only-missing-composite') args.onlyMissingComposite = true
    else if (raw.startsWith('--tenant-id=')) args.tenantId = raw.slice('--tenant-id='.length)
    else if (raw.startsWith('--rate=')) args.ratePerSec = Math.max(1, parseInt(raw.slice('--rate='.length), 10) || 10)
  }
  return args
}

async function getDb() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(
      '[backfill] SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.',
    )
    process.exit(1)
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function listTenants(): Promise<string[]> {
  const db = await getDb()
  const { data, error } = await db.from('tenants').select('id').order('created_at', { ascending: true })
  if (error) {
    console.error('[backfill] could not list tenants:', error.message)
    process.exit(1)
  }
  return (data ?? []).map((t) => t.id as string)
}

async function leadsForTenant(tenantId: string, onlyMissing: boolean): Promise<Array<{ id: string; score_breakdown: unknown }>> {
  const db = await getDb()
  // Page through rows so we don't blow up on large tenants.
  const out: Array<{ id: string; score_breakdown: unknown }> = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await db
      .from('leads')
      .select('id, score_breakdown')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) {
      console.error('[backfill] leads fetch error:', error.message)
      break
    }
    if (!data || data.length === 0) break
    out.push(...(data as typeof out))
    if (data.length < pageSize) break
    from += pageSize
  }
  if (onlyMissing) {
    return out.filter((l) => {
      const b = l.score_breakdown as Record<string, unknown> | null
      return !b || typeof b !== 'object' || (b as Record<string, unknown>).composite === undefined
    })
  }
  return out
}

async function main() {
  const args = parseArgs()
  const tenants = args.tenantId ? [args.tenantId] : await listTenants()
  console.log(
    `[backfill] tenants=${tenants.length} rate=${args.ratePerSec}/sec dryRun=${args.dryRun} onlyMissingComposite=${args.onlyMissingComposite}`,
  )

  const intervalMs = Math.max(1, Math.round(1000 / args.ratePerSec))
  let total = 0
  let updated = 0
  let failed = 0

  for (const tenantId of tenants) {
    const leads = await leadsForTenant(tenantId, args.onlyMissingComposite)
    console.log(`[backfill] tenant=${tenantId} leads=${leads.length}`)
    for (const lead of leads) {
      total++
      if (args.dryRun) {
        process.stdout.write('.')
        if (total % 80 === 0) process.stdout.write('\n')
        continue
      }
      try {
        const r = await calculateScore(lead.id, tenantId)
        if (r.ok) updated++
        else {
          failed++
          console.error(`[backfill] FAIL ${lead.id}: ${r.error}`)
        }
      } catch (e) {
        failed++
        console.error(`[backfill] EXCEPTION ${lead.id}:`, e instanceof Error ? e.message : e)
      }
      // Rate-limit so we don't slam the DB during peak.
      await new Promise((r) => setTimeout(r, intervalMs))
    }
  }

  if (args.dryRun) console.log()
  console.log(`[backfill] done. total=${total} updated=${updated} failed=${failed}`)
}

main().catch((e) => {
  console.error('[backfill] fatal:', e)
  process.exit(1)
})
