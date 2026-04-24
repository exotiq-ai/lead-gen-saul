/**
 * reset-demo.ts — Wipe and reseed the Exotiq demo tenant
 *
 * Deletes all leads, activities, and enrichments for the Exotiq tenant,
 * then re-runs the seed to restore a clean demo state.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx ts-node scripts/reset-demo.ts
 */

import { createClient } from '@supabase/supabase-js'
import { seed } from './seed'

const TENANT_ID = '00000000-exo-tiq-demo-000000000001'

async function resetDemo() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  EXOTIQ DEMO RESET')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  Tenant ID: ${TENANT_ID}`)
  console.log()

  // Delete in FK-safe order: child tables first
  console.log('Deleting enrichments...')
  const { error: enrichErr, count: enrichCount } = await supabase
    .from('enrichments')
    .delete({ count: 'exact' })
    .eq('tenant_id', TENANT_ID)
  if (enrichErr) throw new Error(`Failed to delete enrichments: ${enrichErr.message}`)
  console.log(`  ✓ Deleted ${enrichCount ?? 0} enrichment records`)

  console.log('Deleting scoring history...')
  const { error: scoreErr, count: scoreCount } = await supabase
    .from('scoring_history')
    .delete({ count: 'exact' })
    .eq('tenant_id', TENANT_ID)
  if (scoreErr) throw new Error(`Failed to delete scoring history: ${scoreErr.message}`)
  console.log(`  ✓ Deleted ${scoreCount ?? 0} scoring history records`)

  console.log('Deleting lead activities...')
  const { error: actErr, count: actCount } = await supabase
    .from('lead_activities')
    .delete({ count: 'exact' })
    .eq('tenant_id', TENANT_ID)
  if (actErr) throw new Error(`Failed to delete lead activities: ${actErr.message}`)
  console.log(`  ✓ Deleted ${actCount ?? 0} activity records`)

  console.log('Deleting leads...')
  const { error: leadsErr, count: leadsCount } = await supabase
    .from('leads')
    .delete({ count: 'exact' })
    .eq('tenant_id', TENANT_ID)
  if (leadsErr) throw new Error(`Failed to delete leads: ${leadsErr.message}`)
  console.log(`  ✓ Deleted ${leadsCount ?? 0} leads`)

  console.log()
  console.log('Reseed starting...\n')
  await seed()
}

resetDemo().catch(err => {
  console.error('\n✗ Reset failed:', err.message)
  process.exit(1)
})
