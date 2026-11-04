import { expect, type Locator, type Page, test } from '@playwright/test'

// nuxt-backend-lens toolbar on the demo stand, against whichever backend package the stand runs
// (DEBUG_BACKEND=clockwork|debugbar, read from demo/.env by the test:e2e script).
// Playwright locators pierce the toolbar's open shadow root.

const expectedAdapter = process.env.DEBUG_BACKEND === 'debugbar' ? 'debugbar' : 'clockwork'

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    // By design: 500 is the /boom scenario, 401 is nuxt-auth-sanctum probing /api/user as a guest.
    if (message.type() === 'error' && !/status of (?:401|500)/.test(message.text())) {
      errors.push(message.text())
    }
  })
  return errors
}

async function openPanel(page: Page): Promise<Locator> {
  await page.getByTestId('backend-lens-badge').click()
  const panel = page.getByTestId('backend-lens-panel')
  await expect(panel).toBeVisible()
  return panel
}

function requestRow(panel: Locator, path: string | RegExp): Locator {
  return panel.getByRole('listitem').filter({ hasText: path })
}

test('the N+1 scenario shows 30 author queries pointing at BookResource', async ({ page }) => {
  const errors = collectConsoleErrors(page)
  await page.goto('/')
  await page.getByRole('link', { name: 'N+1: books' }).click()
  await expect(page.getByRole('cell').first()).toBeVisible()

  const panel = await openPanel(page)
  await expect(panel).toContainText('on /books')
  // Row text is concatenated without spaces: "GET/api/books200…".
  const row = requestRow(panel, /GET\/api\/books\d/)
  await expect(row).toContainText('q')
  await row.click()

  const details = panel.getByTestId('backend-lens-details')
  await expect(details).toContainText(`via ${expectedAdapter}`)
  await expect(details).toContainText('BookController@index')
  // The 30 author queries are one N+1 group: open it, then every member is listed.
  await details.getByTestId('backend-lens-group-toggle').click()
  const authorRows = details.getByTestId('backend-lens-query').filter({
    // Resolved inside each row: the row's own SQL, not that of the group members nested in it.
    has: page.locator(':scope > [data-testid="backend-lens-sql"]', { hasText: /from "authors"/i }),
  })
  await expect(authorRows).toHaveCount(30)
  for (const authorRow of (await authorRows.all()).slice(0, 3)) {
    await expect(authorRow.locator(':scope > .bl-query-head')).toContainText('BookResource.php:29')
  }

  expect(errors).toEqual([])
})

test('switching the page scopes the list to the new navigation', async ({ page }) => {
  await page.goto('/books')
  await expect(page.getByRole('cell').first()).toBeVisible()
  await page.getByRole('link', { name: 'Duplicate queries' }).click()
  await expect(page.locator('main pre')).toContainText('books')

  const panel = await openPanel(page)
  await expect(panel).toContainText('on /stats')
  await expect(requestRow(panel, '/api/stats')).toHaveCount(1)
  await expect(requestRow(panel, /\/api\/books(?!\/)/)).toHaveCount(0)

  await panel.getByLabel('all navigations').check()
  await expect(requestRow(panel, /\/api\/books(?!\/)/).first()).toBeVisible()
})

test('every HTTP client is captured: $fetch, useFetch, sanctum, fetch, axios, XHR', async ({ page }) => {
  await page.goto('/clients')
  await expect(page.locator('td', { hasText: /^ok$/ })).toHaveCount(6)

  const panel = await openPanel(page)
  await expect(requestRow(panel, '/api/stats')).toHaveCount(6)
})

test('a 500 is flagged and its exception shown', async ({ page }) => {
  await page.goto('/boom')
  await expect(page.locator('main .error')).toContainText('500')

  const badge = page.getByTestId('backend-lens-badge')
  await expect(badge).toContainText('✕')
  const panel = await openPanel(page)
  await requestRow(panel, '/api/boom').first().click()
  await expect(panel.getByTestId('backend-lens-details')).toContainText('RuntimeException: Demo exception from /api/boom')
})

test('logs of a request are listed with their levels', async ({ page }) => {
  await page.goto('/logs')
  await expect(page.locator('main pre')).toContainText('logged')

  const panel = await openPanel(page)
  await requestRow(panel, '/api/logs').first().click()
  await panel.getByTestId('backend-lens-tab-logs').click()
  const logs = panel.getByTestId('backend-lens-logs')
  for (const message of ['Demo debug message', 'Demo info message', 'Demo warning message', 'Demo error message']) {
    await expect(logs).toContainText(message)
  }
})

test('the sanctum login flow is captured: login, identity fetch, write', async ({ page }) => {
  await page.goto('/reviews')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByText('Logged in as')).toBeVisible()
  await page.getByRole('button', { name: 'Post review' }).click()
  await expect(page.locator('main pre')).toContainText('Posted from the demo SPA')

  const panel = await openPanel(page)
  await panel.getByLabel('all navigations').check()
  // No /sanctum/csrf-cookie here: the XSRF-TOKEN cookie already came with the guest /api/user
  // response, and nuxt-auth-sanctum only asks for it when the cookie is missing.
  await expect(requestRow(panel, '/api/login')).toHaveCount(1)
  await expect(requestRow(panel, /GET\/api\/user200/).first()).toBeVisible()
  const write = requestRow(panel, /POST\/api\/books\/\d+\/reviews/)
  await expect(write).toContainText('201')
  await write.click()
  await expect(panel.getByTestId('backend-lens-queries')).toContainText(/insert into "reviews"/i)
})

test('the toolbar does not inherit or leak page styles', async ({ page }) => {
  await page.goto('/')
  const host = page.locator('#backend-lens-toolbar')
  await expect(host).toHaveCount(1)
  // The demo styles `button`; the badge inside the shadow root must not pick that up.
  const padding = await page.getByTestId('backend-lens-badge').evaluate(element => getComputedStyle(element).padding)
  expect(padding).toBe('6px 10px')
  const pageButtonPadding = await page.getByRole('link', { name: 'Overview' }).evaluate(() => {
    const probe = document.createElement('button')
    document.body.appendChild(probe)
    const value = getComputedStyle(probe).padding
    probe.remove()
    return value
  })
  expect(pageButtonPadding).not.toBe('6px 10px')
})
