import { expect, test } from '@playwright/test'

// The SPA on CROSS_ORIGIN_PORT calls the backend on BACKEND_PORT directly. With the CORS setup the
// README documents (exposed debug headers, CORS on the record endpoints, credentials, and
// Timing-Allow-Origin), the lens reads ids, records and Server-Timing across origins.

const crossOrigin = `http://localhost:${process.env.CROSS_ORIGIN_PORT ?? '18081'}`
const backendOrigin = `http://localhost:${process.env.BACKEND_PORT ?? '18000'}`
const expectedAdapter = process.env.DEBUG_BACKEND === 'debugbar' ? 'debugbar' : 'clockwork'

test('debug data is read from a cross-origin API', async ({ page }) => {
  await page.goto(`${crossOrigin}/cross-origin`)
  await expect(page.getByTestId('origin')).toHaveText(crossOrigin)
  await page.getByTestId('run').click()
  await expect(page.locator('main pre')).toContainText('"books": 30')

  await page.getByTestId('backend-lens-badge').click()
  const panel = page.getByTestId('backend-lens-panel')
  const books = panel.getByRole('listitem').filter({ hasText: /GET\/api\/books\d/ })
  await expect(books).toHaveAttribute('title', `${backendOrigin}/api/books`)
  await expect(books.getByTestId('backend-lens-chip-n-plus-one')).toBeVisible()
  await books.click()
  await expect(panel.getByTestId('backend-lens-details')).toContainText(`via ${expectedAdapter}`)

  const logs = panel.getByRole('listitem').filter({ hasText: '/api/logs' })
  await logs.click()
  await panel.getByTestId('backend-lens-tab-logs').click()
  await expect(panel.getByTestId('backend-lens-logs')).toContainText('Demo warning message')
})

test('Server-Timing survives the origin change thanks to Timing-Allow-Origin', async ({ page }) => {
  test.skip(expectedAdapter !== 'clockwork', 'Debugbar does not send Server-Timing by default')
  await page.goto(`${crossOrigin}/cross-origin`)
  await page.getByTestId('run').click()
  await expect(page.locator('main pre')).toContainText('"books": 30')

  await expect.poll(() => page.evaluate((backend) => {
    const lens = (window as unknown as { __BACKEND_LENS__: { store: { entries: { url: string, serverTiming: { name: string }[] }[] } } }).__BACKEND_LENS__
    return lens.store.entries.find(entry => entry.url === `${backend}/api/books`)?.serverTiming.map(metric => metric.name) ?? []
  }, backendOrigin)).toContain('db')
})
