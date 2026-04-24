/**
 * Migration runner for Saul LeadGen
 * Requires: SUPABASE_DB_PASSWORD env var
 * Find your DB password at:
 * https://supabase.com/dashboard/project/qbvkisrazmipmwlejqtf/settings/database
 * (Settings > Database > Connection string > URI > copy the password from there)
 *
 * Run: SUPABASE_DB_PASSWORD=your_password npm run migrate
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Client } from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD
if (!DB_PASSWORD) {
  console.error('❌ SUPABASE_DB_PASSWORD is required')
  console.error(
    '   Find it at: https://supabase.com/dashboard/project/qbvkisrazmipmwlejqtf/settings/database'
  )
  process.exit(1)
}

const MIGRATIONS = [
  '001_core_schema.sql',
  '002_rls_policies.sql',
  '003_scoring_functions.sql',
  '004_views_and_indexes.sql',
  '005_enrichment_tables.sql',
]

async function migrate() {
  const client = new Client({
    host: 'db.qbvkisrazmipmwlejqtf.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })

  try {
    console.log('Connecting to database...')
    await client.connect()
    console.log('Connected.\n')

    for (const file of MIGRATIONS) {
      const path = join(__dirname, '..', 'supabase', 'migrations', file)
      const sql = readFileSync(path, 'utf8')

      console.log(`Running ${file}...`)
      try {
        await client.query(sql)
        console.log(`  ✓ ${file}`)
      } catch (err) {
        const msg = (err as Error).message
        if (
          msg.includes('already exists') ||
          msg.includes('duplicate') ||
          msg.includes('DUPLICATE')
        ) {
          console.log(`  ⚠ ${file} — already applied (skipped)`)
        } else {
          console.error(`  ✗ ${file} failed: ${msg}`)
          throw err
        }
      }
    }

    console.log('\nAll migrations complete.')
  } finally {
    await client.end()
  }
}

migrate().catch((err) => {
  console.error('\nMigration failed:', err.message)
  process.exit(1)
})
