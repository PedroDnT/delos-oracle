import { test, expect, type Page } from '@playwright/test'

/**
 * The dashboard talks to the Python backend. These tests stub that backend at
 * the network layer so the suite exercises the real UI without needing the API
 * (or a funded oracle) to be running.
 */
const BACKEND_RATES = '**/rates'

const rate = (rate_type: string, raw_value: number, is_stale = false) => ({
  rate_type,
  answer: Math.round(raw_value * 1e8),
  raw_value,
  real_world_date: 20240101,
  timestamp: Math.floor(Date.now() / 1000),
  source: 'BCB-12',
  is_stale,
  heartbeat_seconds: 172800,
})

async function stubRates(page: Page, body: unknown, status = 200) {
  await page.route(BACKEND_RATES, (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  )
}

test.describe('Oracle dashboard', () => {
  test('renders the dashboard heading', async ({ page }) => {
    await stubRates(page, [rate('IPCA', 4.5)])
    await page.goto('/')

    await expect(page.locator('h1')).toContainText('DELOS Oracle Dashboard')
  })

  test('renders a card for each rate returned by the backend', async ({ page }) => {
    await stubRates(page, [rate('IPCA', 4.5), rate('CDI', 10.9), rate('PTAX', 5.812)])
    await page.goto('/')

    await expect(page.getByText('Current Macro Rates')).toBeVisible()
    await expect(page.getByText('4.50%')).toBeVisible()
    await expect(page.getByText('10.90%')).toBeVisible()
    await expect(page.getByText('5.812', { exact: true })).toBeVisible()
  })

  test('flags stale rates', async ({ page }) => {
    await stubRates(page, [rate('SELIC', 13.75, true)])
    await page.goto('/')

    await expect(page.getByText(/Stale data/)).toBeVisible()
  })

  test('explains an empty oracle instead of rendering a blank page', async ({ page }) => {
    await stubRates(page, [])
    await page.goto('/')

    await expect(page.getByText('No rates available')).toBeVisible()
  })

  test('surfaces a backend outage', async ({ page }) => {
    await page.route(BACKEND_RATES, (route) => route.abort('connectionrefused'))
    await page.goto('/')

    // react-query retries with exponential backoff before giving up, so the
    // error state takes noticeably longer to appear than the happy path.
    await expect(page.getByText('Failed to load rates')).toBeVisible({
      timeout: 30_000,
    })
  })
})
