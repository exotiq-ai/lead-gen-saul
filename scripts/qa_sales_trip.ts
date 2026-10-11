import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })
const base = process.env.TRIP_QA_BASE || 'http://127.0.0.1:3101'
const path = process.env.TRIP_QA_PAGE || '/dashboard/road-trip/denver-miami'
const output = process.env.TRIP_QA_OUTPUT || `${process.env.HOME}/.hermes/work/denver-miami-sales-trip/qa`
const allowedHosts = ['127.0.0.1', 'localhost', 'leadsbysaul.netlify.app']
if (!allowedHosts.includes(new URL(base).hostname) || !path.startsWith('/dashboard/road-trip')) throw new Error('Unexpected QA target')

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const email = (process.env.DASHBOARD_ADMIN_EMAILS || 'gregory@exotiq.ai').split(',')[0].trim()
  const auth = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  // Generate-and-verify creates an in-memory session; it does NOT send a login email.
  const generated = await auth.auth.admin.generateLink({ type: 'magiclink', email })
  if (generated.error || !generated.data.properties?.hashed_token) throw new Error('No-send QA login generation failed')
  const verified = await auth.auth.verifyOtp({ token_hash: generated.data.properties.hashed_token, type: 'email' })
  if (verified.error || !verified.data.session) throw new Error('No-send QA login verification failed')
  const cookieWrites: Array<{name: string; value: string}> = []
  const ssr = createServerClient(url, serviceKey, { cookies: { getAll: () => [], setAll: c => { cookieWrites.push(...c) } } })
  const set = await ssr.auth.setSession(verified.data.session)
  if (set.error || !cookieWrites.length) throw new Error('No SSR cookies created')
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const errors: string[] = []
  const responseFailures: string[] = []
  try {
    const ctx = await browser.newContext()
    await ctx.addCookies(cookieWrites.map(c => ({ ...c, url: base })))
    await ctx.route('**/api/**', async route => {
      if (route.request().method() !== 'GET') throw new Error('QA attempted a non-read-only API request')
      await route.continue()
    })
    const page = await ctx.newPage()
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400) responseFailures.push(`${r.status()} ${new URL(r.url()).pathname}`) })
    const checks: Record<string, unknown> = {}
    for (const [label, width, height] of [['mobile-small', 320, 740], ['mobile', 390, 844], ['desktop', 1440, 1000]] as const) {
      await page.setViewportSize({ width, height })
      const res = await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60_000 })
      if (res?.status() !== 200 || page.url().includes('/login')) throw new Error('Authenticated page did not load')
      await page.locator('h1').last().waitFor()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      if (overflow) throw new Error(`${label} horizontal overflow`)
      await page.screenshot({ path: `${output}/${label}.png` })
      checks[label] = { http: res.status(), heading: await page.locator('h1').last().innerText(), overflow }
    }
    if (path.includes('denver-miami')) {
      const api = await ctx.request.get(base + '/api/leads/road-trip/denver-miami')
      if (!api.ok()) throw new Error(`Trip API ${api.status()}`)
      const payload = await api.json()
      if (!payload.data?.length) throw new Error('Trip API has no persisted research leads')
      checks.api_leads = payload.data.length
      await page.setViewportSize({ width: 390, height: 844 })
      await page.getByLabel('Choose market').selectOption('atlanta')
      await page.waitForURL('**city=atlanta**')
      await page.getByRole('heading', { name: 'Atlanta prospects' }).waitFor()
      checks.atlanta_cards = await page.locator('[data-trip-lead]').count()
      if (!checks.atlanta_cards) throw new Error('Atlanta filter returned no cards')
      await page.getByLabel('Search researched operators').fill('zzzz-no-match-qa')
      await page.getByText('No matching prospects').waitFor()
      await page.getByLabel('Search researched operators').fill('')
      await page.getByLabel('Show only matched visit locations').check()
      checks.visit_filter_cards = await page.locator('[data-trip-lead]').count()
      await page.getByLabel('Show only matched visit locations').uncheck()
      const details = page.locator('[data-trip-lead] details').first()
      if (await details.count()) { await details.locator('summary').click(); await details.scrollIntoViewIfNeeded() }
      await page.screenshot({ path: `${output}/mobile-evidence.png` })
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Expanded evidence overflow')
      const links = await page.locator('a').evaluateAll(nodes => nodes.map(n => ({ label: n.textContent, href: (n as HTMLAnchorElement).href })))
      if (links.some(l => /maps\.apple|waze\.com/.test(l.href))) throw new Error('Non-Google navigation found')
      checks.navigation_google_only = true
      checks.field_links = links.filter(l => /tel:|mailto:|maps\/dir|instagram/.test(l.href)).length
      const sample = payload.data.find((lead: { market: string }) => lead.market === 'st-louis') || payload.data[0]
      const detailResponse = await page.goto(`${base}/dashboard/leads/${sample.id}`, { waitUntil: 'networkidle' })
      if (detailResponse?.status() !== 200) throw new Error('Canonical lead detail did not load')
      const tripLink = page.getByRole('link', { name: 'Road-trip research', exact: true })
      await tripLink.waitFor()
      checks.canonical_detail_link = await tripLink.getAttribute('href')
      await tripLink.click()
      await page.waitForURL(`**#lead-${sample.id}`)
      await page.locator(`[data-trip-lead="${sample.id}"]`).waitFor()
      await page.locator('details[aria-label="Trip plan"] > summary').click()
      await page.getByLabel('Include Orlando as a conditional detour').check()
      await page.getByText(/Approximately 2,135 miles/).waitFor()
      checks.orlando_option = true
      checks.previous_trip_status = (await ctx.request.get(base + '/dashboard/road-trip')).status()
      if (checks.previous_trip_status !== 200) throw new Error('Previous trip no longer reachable')
      const unauth = await browser.newContext()
      checks.unauth_api_status = (await unauth.request.get(base + '/api/leads/road-trip/denver-miami')).status()
      if (checks.unauth_api_status !== 401) throw new Error('Trip API is not protected')
      await unauth.close()
    }
    if (errors.length || responseFailures.length) throw new Error(JSON.stringify({errors,responseFailures}))
    const result = { ok: true, base, path, checks, console_errors: errors, api_failures: responseFailures, no_messages_sent: true, output }
    await writeFile(`${output}/result.json`, JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await browser.close()
    await auth.auth.signOut({ scope: 'local' })
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'QA failed'); process.exit(1) })
