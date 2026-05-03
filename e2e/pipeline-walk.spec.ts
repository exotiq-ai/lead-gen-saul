import { test, expect } from '@playwright/test'
import { attachMocks } from './fixtures/mockApi'

// CI cold-start with Tailwind 4 + Turbopack can take >5s.
const FIRST_PAINT_TIMEOUT = 20_000

test.describe('pipeline walk', () => {
  test.beforeEach(async ({ page }) => {
    await attachMocks(page)
  })

  test('overview renders headline metrics from /api/dashboard/kpis', async ({ page }) => {
    await page.goto('/dashboard')
    // The Overview page has no h1 of its own -- only the TopBar h1 says
    // 'Overview'. So we anchor on the TopBar instance and the KPI labels.
    await expect(
      page.getByRole('banner').getByRole('heading', { name: 'Overview' }),
    ).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT })
    // KPI labels render once SWR resolves the (mocked) /api/dashboard/kpis.
    await expect(page.getByText('Total Active Leads')).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    })
    await expect(page.getByText('Avg Lead Score')).toBeVisible()
  })

  test('leads page lists the mocked lead', async ({ page }) => {
    await page.goto('/dashboard/leads')
    // 'Leads' h1 lives inside <main>; TopBar also has an h1 with the same
    // title, so scope by main.
    await expect(
      page.getByRole('main').getByRole('heading', { name: 'Leads' }),
    ).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT })
    await expect(page.getByText('Mock Exotic Rentals')).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    })
  })

  test('outreach approve flow flips the row to approved', async ({ page }) => {
    await page.goto('/dashboard/outreach')
    await expect(
      page.getByRole('main').getByRole('heading', { name: 'Outreach approval' }),
    ).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT })
    await expect(page.getByText('Mock Exotic Rentals')).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    })

    // window.confirm popups: auto-accept.
    page.on('dialog', (d) => d.accept())

    await page.getByRole('button', { name: /^Approve$/ }).first().click()

    await expect(page.getByText('approved').first()).toBeVisible({ timeout: 10_000 })
  })

  test('agents page shows online gateway when heartbeat is fresh', async ({ page }) => {
    await page.goto('/dashboard/agents')
    await expect(page.getByText('OpenClaw — Saul layer')).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    })
    await expect(page.getByText('online').first()).toBeVisible()
  })

  test('exports page lists all four datasets', async ({ page }) => {
    await page.goto('/dashboard/exports')
    await expect(
      page.getByRole('main').getByRole('heading', { name: 'Exports' }),
    ).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT })
    // The dataset cards render <h2>Leads</h2>, <h2>Outreach queue</h2>, etc.
    // Disambiguate from the topbar h1 + sidebar nav text via level=2.
    await expect(page.getByRole('heading', { level: 2, name: 'Leads' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Outreach queue' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Enrichments' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Lead activities' })).toBeVisible()
  })
})
