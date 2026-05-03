import { test, expect } from '@playwright/test'
import { attachMocks } from './fixtures/mockApi'

test.describe('pipeline walk', () => {
  test.beforeEach(async ({ page }) => {
    await attachMocks(page)
  })

  test('overview renders headline metrics from /api/dashboard/kpis', async ({ page }) => {
    await page.goto('/dashboard')
    // The TopBar renders an <h1>Overview</h1> too, so scope to page main.
    await expect(page.getByRole('main').getByRole('heading', { name: 'Overview' })).toBeVisible()
    // KPI labels render once SWR resolves the (mocked) /api/dashboard/kpis.
    // Use a slightly longer timeout because Tailwind 4 + Turbopack first
    // paint on a cold dev server can take >5s on CI runners.
    await expect(page.getByText('Total Active Leads')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Avg Lead Score')).toBeVisible()
  })

  test('leads page lists the mocked lead', async ({ page }) => {
    await page.goto('/dashboard/leads')
    // 'Leads' appears in TopBar AND in the page H1 -- scope to main.
    await expect(page.getByRole('main').getByRole('heading', { name: 'Leads' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText('Mock Exotic Rentals')).toBeVisible()
  })

  test('outreach approve flow flips the row to approved', async ({ page }) => {
    await page.goto('/dashboard/outreach')
    await expect(
      page.getByRole('main').getByRole('heading', { name: 'Outreach approval' }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Mock Exotic Rentals')).toBeVisible()

    // window.confirm popups: auto-accept.
    page.on('dialog', (d) => d.accept())

    await page.getByRole('button', { name: /^Approve$/ }).first().click()

    await expect(page.getByText('approved').first()).toBeVisible({ timeout: 10_000 })
  })

  test('agents page shows online gateway when heartbeat is fresh', async ({ page }) => {
    await page.goto('/dashboard/agents')
    await expect(page.getByText('OpenClaw — Saul layer')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('online').first()).toBeVisible()
  })

  test('exports page lists all four datasets', async ({ page }) => {
    await page.goto('/dashboard/exports')
    await expect(
      page.getByRole('main').getByRole('heading', { name: 'Exports' }),
    ).toBeVisible({ timeout: 15_000 })
    // The dataset cards render <h2>Leads</h2>, <h2>Outreach queue</h2>, etc.
    // 'Leads' h2 collides with the topbar h1 + sidebar nav text -- scope to
    // role=heading level=2 to disambiguate.
    await expect(page.getByRole('heading', { level: 2, name: 'Leads' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Outreach queue' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Enrichments' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Lead activities' })).toBeVisible()
  })
})
