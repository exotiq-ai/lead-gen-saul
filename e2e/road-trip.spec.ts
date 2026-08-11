import { expect, test } from '@playwright/test'
import { attachMocks } from './fixtures/mockApi'

test.describe('Exotiq road-trip command center', () => {
  test.beforeEach(async ({ page }) => {
    await attachMocks(page)
  })

  test('renders a separate interactive city route and actionable lead cards', async ({ page }) => {
    await page.goto('/dashboard/road-trip?city=dallas')

    await expect(page.getByRole('main').getByRole('heading', { name: 'Road Trip Command Center' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Dallas.*1 lead/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Miami.*1 lead/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Mock Dallas Exotics', exact: true })).toBeVisible()

    await expect(page.getByRole('link', { name: /Call/i }).first()).toHaveAttribute('href', 'tel:+12145550100')
    await expect(page.getByRole('link', { name: 'Text', exact: true }).first()).toHaveAttribute('href', 'sms:+12145550100')
    await expect(page.getByRole('link', { name: 'Email', exact: true }).first()).toHaveAttribute('href', 'mailto:dana@mockdallas.example')
    await expect(page.getByRole('link', { name: /Instagram/i }).first()).toHaveAttribute('href', 'https://www.instagram.com/mockdallas/')
    await expect(page.getByRole('link', { name: /Directions/i }).first()).toHaveAttribute('href', /google\.com\/maps\/search/)
    await expect(page.getByText(/City-level location/).first()).toBeVisible()

    await page.getByRole('link', { name: /Miami.*1 lead/i }).click()
    await expect(page).toHaveURL(/city=miami/)
    await expect(page.getByRole('heading', { name: 'Mock Miami Luxury Cars', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Mock Dallas Exotics', exact: true })).toHaveCount(0)
  })

  test('has no page-level horizontal overflow on a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/dashboard/road-trip?city=dallas')
    await expect(page.getByRole('heading', { name: 'Mock Dallas Exotics', exact: true })).toBeVisible()

    const widths = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }))
    expect(widths.document).toBeLessThanOrEqual(widths.viewport)
  })
})
