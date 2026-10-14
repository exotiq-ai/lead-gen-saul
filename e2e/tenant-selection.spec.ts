import { test, expect, type Page } from '@playwright/test'
import { attachMocks, fixtures } from './fixtures/mockApi'

const EXOTIQ = fixtures.TENANT_EXOTIQ
const ASK_SAUL = '22222222-2222-2222-2222-222222222222'
const MEDSPA = '11111111-1111-1111-1111-111111111111'
const tenants = [
  { id: EXOTIQ, slug: 'exotiq', name: 'Exotiq', icon: '🚗' },
  { id: MEDSPA, slug: 'medspa-boulder', name: 'MedSpa Boulder', icon: '💉' },
  { id: ASK_SAUL, slug: 'ask-saul', name: 'Ask Saul', icon: '☎️' },
]

async function setup(page: Page, catalog: 'live' | 'unavailable' = 'live') {
  await attachMocks(page)
  await page.route('**/api/tenants', async route => {
    await route.fulfill({ status: catalog === 'live' ? 200 : 503, json: { tenants } })
  })
  const requests: string[] = []
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/') && url.searchParams.has('tenant_id')) {
      requests.push(url.searchParams.get('tenant_id')!)
    }
  })
  await page.route('**/api/leads?**', route => {
    const tenantId = new URL(route.request().url()).searchParams.get('tenant_id')
    const lead = { ...fixtures.mockLead, company_name: tenantId === ASK_SAUL ? 'Ask Saul service-business fixture' : tenantId === MEDSPA ? 'MedSpa fixture' : 'Exotiq fixture' }
    return route.fulfill({ json: { data: [lead], meta: { total: 1, page: 1, limit: 50, totalPages: 1 } } })
  })
  return requests
}

test('sidebar selector exposes Ask Saul and agrees with the header', async ({ page, isMobile }) => {
  const requests = await setup(page)
  await page.goto('/dashboard/leads?tenant=exotiq')
  await expect(page.getByText('Exotiq fixture', { exact: true })).toBeVisible()
  if (isMobile) await page.getByRole('button', { name: 'Toggle navigation' }).click()
  await page.getByRole('button', { name: /Tenant Exotiq/ }).filter({ visible: true }).click()
  requests.length = 0

  await page.getByRole('option', { name: /Ask Saul/ }).click()

  await expect(page).toHaveURL(/tenant=ask-saul/)
  await expect(page.getByText('Ask Saul service-business fixture', { exact: true })).toBeVisible()
  expect(requests.every(id => id === ASK_SAUL)).toBe(true)
  await page.goto('/dashboard/leads')
  await expect(page).toHaveURL(/tenant=ask-saul/)
  await expect(page.getByRole('main').getByRole('button', { name: /Ask Saul/ })).toBeVisible()
})

test('unknown URL shows a tenant selection state instead of Exotiq data', async ({ page }) => {
  const requests = await setup(page)
  await page.goto('/dashboard/leads?tenant=does-not-exist')
  await expect(page.getByRole('main').getByRole('button', { name: '🏢 Select tenant ▼' })).toBeVisible()
  await expect(page.getByText('This tenant is unavailable or still loading.', { exact: false })).toBeVisible()
  expect(requests).not.toContain(EXOTIQ)
  await expect(page.getByText('Exotiq fixture', { exact: true })).toHaveCount(0)
})

test('explicit empty tenant stays unselected despite a saved Ask Saul workspace', async ({ page }) => {
  const requests = await setup(page)
  await page.addInitScript(() => localStorage.setItem('saul-dashboard', JSON.stringify({ state: { activeTenantId: '22222222-2222-2222-2222-222222222222' }, version: 0 })))
  await page.goto('/dashboard/leads?tenant=', { waitUntil: 'networkidle' })
  await expect(page.getByRole('main').getByRole('button', { name: /Select tenant/ })).toBeVisible()
  await expect(page).toHaveURL(/tenant=$/)
  expect(requests).not.toContain(ASK_SAUL)
  expect(requests).not.toContain(EXOTIQ)
})

for (const [label, payload] of [
  ['empty', { tenants: [] }],
  ['null entry', { tenants: [null] }],
  ['non-array', { tenants: 'bad catalog' }],
] as const) {
  test(`${label} catalog recovers with the seeded Ask Saul workspace`, async ({ page }) => {
    const requests = await setup(page)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/tenants', route => route.fulfill({ json: payload }))
    await page.goto('/dashboard/leads?tenant=ask-saul', { waitUntil: 'networkidle' })
    await expect(page.getByRole('main').getByRole('button', { name: /Ask Saul/ })).toBeVisible()
    await expect(page.getByText('Ask Saul service-business fixture', { exact: true })).toBeVisible()
    expect(errors).toEqual([])
    expect(requests.length).toBeGreaterThan(0)
    expect(requests.every(id => id === ASK_SAUL)).toBe(true)
  })
}

// Local fixture coverage only. No leads, CRM records or sends are changed.
test('top dropdown includes Ask Saul and switches leads to its UUID', async ({ page }) => {
  const requests = await setup(page)
  await page.goto('/dashboard/leads?tenant=exotiq')
  await expect(page.getByText('Exotiq fixture', { exact: true })).toBeVisible()
  await page.getByRole('main').getByRole('button', { name: /Exotiq/ }).click()
  const option = page.getByRole('main').getByRole('link', { name: /Ask Saul/ })
  await expect(option).toBeVisible()
  requests.length = 0
  await option.click()
  await expect(page).toHaveURL(/tenant=ask-saul/)
  await expect(page.getByRole('main').getByRole('button', { name: /Ask Saul/ })).toBeVisible()
  await expect(page.getByText('Ask Saul service-business fixture', { exact: true })).toBeVisible()
  expect(requests.length).toBeGreaterThan(0)
  expect(requests.every(id => id === ASK_SAUL)).toBe(true)
})

for (const catalog of ['live', 'unavailable'] as const) {
  for (const param of ['ask-saul', ASK_SAUL]) {
    test(`direct Ask Saul ${param} with ${catalog} catalog never requests Exotiq`, async ({ page }) => {
      const requests = await setup(page, catalog)
      await page.addInitScript(() => localStorage.setItem('saul-dashboard', JSON.stringify({ state: { activeTenantId: '00000000-0000-0000-0000-000000000001' }, version: 0 })))
      await page.goto(`/dashboard/leads?tenant=${param}`)
      await expect(page.getByRole('main').getByRole('button', { name: /Ask Saul/ })).toBeVisible()
      await expect(page.getByText('Ask Saul service-business fixture', { exact: true })).toBeVisible()
      expect(requests.length).toBeGreaterThan(0)
      expect(requests.every(id => id === ASK_SAUL)).toBe(true)
      await page.reload()
      await expect(page.getByRole('main').getByRole('button', { name: /Ask Saul/ })).toBeVisible()
      expect(requests.every(id => id === ASK_SAUL)).toBe(true)
    })
  }
}

test('switching back to MedSpa keeps its header and data aligned', async ({ page }) => {
  const requests = await setup(page)
  await page.goto('/dashboard/leads?tenant=ask-saul')
  await expect(page.getByText('Ask Saul service-business fixture', { exact: true })).toBeVisible()
  await page.getByRole('main').getByRole('button', { name: /Ask Saul/ }).click()
  requests.length = 0
  await page.getByRole('main').getByRole('link', { name: /MedSpa/ }).click()
  await expect(page).toHaveURL(/tenant=medspa-boulder/)
  await expect(page.getByText('MedSpa fixture', { exact: true })).toBeVisible()
  expect(requests.length).toBeGreaterThan(0)
  expect(requests.every(id => id === MEDSPA)).toBe(true)
})

test('Ask Saul outreach and sidebar navigation retain the tenant', async ({ page, isMobile }) => {
  const requests = await setup(page)
  await page.goto('/dashboard/outreach?tenant=ask-saul')
  await expect(page.getByRole('main').getByRole('button', { name: /Ask Saul/ })).toBeVisible()
  await expect(page.getByRole('main').getByRole('heading', { name: 'Outreach approval' })).toBeVisible()
  if (isMobile) await page.getByRole('button', { name: 'Toggle navigation' }).click()
  const nav = page.getByRole('navigation', { name: 'Primary navigation' }).filter({ visible: true })
  await nav.getByRole('link', { name: /^Leads/ }).click()
  await expect(page).toHaveURL(/\/dashboard\/leads\?tenant=ask-saul/)
  await expect(page.getByText('Ask Saul service-business fixture', { exact: true })).toBeVisible()
  expect(requests.length).toBeGreaterThan(0)
  expect(requests.every(id => id === ASK_SAUL)).toBe(true)
})
