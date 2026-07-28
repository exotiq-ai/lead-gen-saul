#!/usr/bin/env node
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { config as loadDotenv } from 'dotenv'

loadDotenv({ path: '.env.local', override: true })

const TEST_EMAIL = 'gregory.ringler@gmail.com'
const ADMIN_EMAIL = process.env.SEQUENCE_UI_QA_ADMIN_EMAIL || TEST_EMAIL
const BASE_URL = process.env.SEQUENCE_UI_QA_BASE_URL || 'http://127.0.0.1:3100'
const OUTPUT_DIR = process.env.SEQUENCE_UI_QA_OUTPUT_DIR || `${process.env.HOME}/.hermes/work/exotiq-gtm`

function assertOutboundLocked() {
  if (
    process.env.EXOTIQ_SEQUENCE_DEMO_SEND_ENABLED === 'true'
    || process.env.EXOTIQ_CUSTOMER_SEQUENCE_ENROLLMENT_ENABLED === 'true'
    || process.env.OUTREACH_LIVE_SENDS_ENABLED === 'true'
    || process.env.RESEND_OUTBOUND_DRY_RUN === 'false'
  ) throw new Error('refusing dashboard QA because outbound gates are not locked')
}

async function main() {
  assertOutboundLocked()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !serviceKey) throw new Error('Supabase QA credentials are unavailable')
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: ADMIN_EMAIL })
  if (error) throw new Error(error.message)
  const tokenHash = data.properties?.hashed_token
  if (!tokenHash) throw new Error('Supabase did not return a no-send login token hash')
  const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
  if (verifyError || !verified.session) throw new Error(verifyError?.message || 'no-send login token could not be verified')
  const cookieWrites: Array<{ name: string; value: string }> = []
  const cookieClient = createServerClient(url, serviceKey, {
    cookies: {
      getAll: () => [],
      setAll: (cookies) => { cookieWrites.push(...cookies.map(({ name, value }) => ({ name, value }))) },
    },
  })
  const { error: sessionError } = await cookieClient.auth.setSession({
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
  })
  if (sessionError || !cookieWrites.length) throw new Error(sessionError?.message || 'SSR auth cookies were not created')

  await mkdir(OUTPUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const consoleErrors: string[] = []
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.addCookies(cookieWrites.map((cookie) => ({ ...cookie, url: BASE_URL })))
    const page = await context.newPage()
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    page.on('pageerror', (errorValue) => consoleErrors.push(errorValue.message))
    await page.goto(`${BASE_URL}/dashboard/guide/sequence`, { waitUntil: 'networkidle' })
    try {
      await page.getByRole('heading', { name: 'Infrastructure on, outbound off' }).waitFor({ state: 'visible', timeout: 20_000 })
    } catch (error) {
      const current = new URL(page.url())
      const bodyText = (await page.locator('body').innerText().catch(() => '')).slice(0, 500)
      await page.screenshot({ path: `${OUTPUT_DIR}/sequence-operations-qa-failure.png`, fullPage: true }).catch(() => undefined)
      throw new Error(`operations panel did not render at ${current.origin}${current.pathname}; page text: ${bodyText}; ${error instanceof Error ? error.message : String(error)}`)
    }
    await page.getByText('SAFE HOLD', { exact: true }).waitFor({ state: 'visible' })
    await page.getByText(TEST_EMAIL, { exact: true }).first().waitFor({ state: 'visible' })
    const ledgerRows = page.locator('article').filter({ has: page.getByText(/step [1-9]/) })
    const ledgerCount = await ledgerRows.count()
    if (ledgerCount < 4) throw new Error(`expected at least four delivery-ledger rows, found ${ledgerCount}`)
    const ghlLinks = await page.getByRole('link', { name: /Open GHL contact/ }).count()
    if (ghlLinks < 1) throw new Error('delivery ledger did not expose a direct GHL contact link')
    await page.screenshot({ path: `${OUTPUT_DIR}/sequence-operations-desktop.png`, fullPage: true })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: 'Infrastructure on, outbound off' }).waitFor({ state: 'visible' })
    await page.screenshot({ path: `${OUTPUT_DIR}/sequence-operations-mobile.png`, fullPage: true })

    if (consoleErrors.length) throw new Error(`browser console errors: ${consoleErrors.join(' | ')}`)
    console.log(JSON.stringify({
      ok: true,
      no_email_sent: true,
      test_customer: TEST_EMAIL,
      safe_hold_visible: true,
      delivery_ledger_rows: ledgerCount,
      direct_ghl_links: ghlLinks,
      desktop_screenshot: `${OUTPUT_DIR}/sequence-operations-desktop.png`,
      mobile_screenshot: `${OUTPUT_DIR}/sequence-operations-mobile.png`,
      console_errors: 0,
    }, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, no_email_sent: true, error: error instanceof Error ? error.message : String(error) }))
  process.exit(1)
})
