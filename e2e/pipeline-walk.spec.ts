import { test, expect } from '@playwright/test'
import { attachMocks } from './fixtures/mockApi'

test.describe('pipeline walk', () => {
  test.beforeEach(async ({ page }) => {
    await attachMocks(page)
  })

  test('overview renders headline metrics from /api/dashboard/kpis', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
    // KPI labels render even before data loads; values come from the mock.
    await expect(page.getByText('Total Active Leads')).toBeVisible()
    await expect(page.getByText('Avg Lead Score')).toBeVisible()
  })

  test('leads page lists the mocked lead', async ({ page }) => {
    await page.goto('/dashboard/leads')
    await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible()
    await expect(page.getByText('Mock Exotic Rentals')).toBeVisible()
  })

  test('outreach approve flow flips the row to approved', async ({ page }) => {
    await page.goto('/dashboard/outreach')
    await expect(page.getByRole('heading', { name: 'Outreach approval' })).toBeVisible()
    await expect(page.getByText('Mock Exotic Rentals')).toBeVisible()

    // The approve confirm dialog uses window.confirm which Playwright
    // accepts by default with .acceptDialog. We override here:
    page.on('dialog', (d) => d.accept())

    await page.getByRole('button', { name: /^Approve$/ }).first().click()

    // After approve, the row's badge text should change to "approved".
    await expect(page.getByText('approved').first()).toBeVisible({ timeout: 5_000 })
  })

  test('agents page shows online gateway when heartbeat is fresh', async ({ page }) => {
    await page.goto('/dashboard/agents')
    await expect(page.getByText('OpenClaw — Saul layer')).toBeVisible()
    await expect(page.getByText('online').first()).toBeVisible()
  })

  test('exports page lists all four datasets', async ({ page }) => {
    await page.goto('/dashboard/exports')
    await expect(page.getByRole('heading', { name: 'Exports' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Outreach queue' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Enrichments' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Lead activities' })).toBeVisible()
  })
})
