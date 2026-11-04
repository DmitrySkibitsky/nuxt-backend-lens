import { expect, type Locator, type Page, test } from '@playwright/test'

// Requests are attributed to the user action that triggered them (click / submit / change within
// the configured window). Clicks on the lens toolbar itself are not actions.

async function openPanel(page: Page): Promise<Locator> {
  await page.getByTestId('backend-lens-badge').click()
  const panel = page.getByTestId('backend-lens-panel')
  await expect(panel).toBeVisible()
  return panel
}

test('a button click groups the requests it caused', async ({ page }) => {
  await page.goto('/clients')
  await expect(page.locator('main td', { hasText: /^ok$/ })).toHaveCount(6)

  // The first six requests ran on mount, without any action; these six follow a click.
  await page.getByRole('button', { name: 'Run all' }).click()
  await expect(page.locator('main td', { hasText: /^ok$/ })).toHaveCount(6)

  const panel = await openPanel(page)
  await expect(panel.getByRole('listitem').filter({ hasText: '/api/stats' })).toHaveCount(12)
  const header = panel.getByTestId('backend-lens-action')
  await expect(header).toHaveCount(1)
  await expect(header).toHaveText(/click “Run all”/)

  await panel.getByRole('listitem').filter({ hasText: '/api/stats' }).last().click()
  await expect(panel.getByTestId('backend-lens-triggered-by')).toContainText('triggered by click “Run all”')
})

test('a link click is the action behind the next page’s requests', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'N+1: books' }).click()
  await expect(page.locator('main table')).toBeVisible()

  const panel = await openPanel(page)
  await expect(panel.getByTestId('backend-lens-action').first()).toHaveText(/click “N\+1: books”/)
})

test('a form submit is labelled by its submit button, and clicks on the toolbar are ignored', async ({ page }) => {
  await page.goto('/reviews')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByText('Logged in as')).toBeVisible()

  const panel = await openPanel(page)
  await panel.getByLabel('all navigations').check()
  const loginHeader = panel.getByTestId('backend-lens-action').filter({ hasText: 'Log in' })
  await expect(loginHeader).toHaveText(/submit “Log in”/)
  // Opening the panel and ticking the checkbox happened inside the toolbar: no such actions.
  await expect(panel.getByTestId('backend-lens-action').filter({ hasText: /Backend|all navigations/ })).toHaveCount(0)
})
