import { expect, test } from '@playwright/test'

// A response without Clockwork / Debugbar ids but with a Server-Timing header falls back to the
// server-timing adapter (both stands: the endpoint is excluded from both packages).

test('a backend without a debug package still shows server and database time', async ({ page }) => {
  await page.goto('/timing-only')
  await expect(page.locator('main pre')).toContainText('"books"')

  await page.getByTestId('backend-lens-badge').click()
  const panel = page.getByTestId('backend-lens-panel')
  const row = panel.getByRole('listitem').filter({ hasText: '/api/timing-only' })
  await expect(row).toContainText('timing only')
  await expect(row).toContainText('DB')
  await row.click()

  const details = panel.getByTestId('backend-lens-details')
  await expect(details).toContainText('via server-timing')
  await expect(panel.getByTestId('backend-lens-note')).toContainText('Timing only')
  await panel.getByTestId('backend-lens-tab-timeline').click()
  await expect(panel.getByTestId('backend-lens-timeline')).toContainText('Database (db)')
  await expect(panel.getByTestId('backend-lens-timeline')).toContainText('Total (total)')
})
