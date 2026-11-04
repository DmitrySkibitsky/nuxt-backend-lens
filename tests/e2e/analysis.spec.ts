import { expect, type Locator, type Page, test } from '@playwright/test'

// Query analysis, navigation summary, cache and timeline tabs, and the Nuxt DevTools shell, against
// either backend package (DEBUG_BACKEND=clockwork|debugbar).

async function openPanel(page: Page): Promise<Locator> {
  await page.getByTestId('backend-lens-badge').click()
  const panel = page.getByTestId('backend-lens-panel')
  await expect(panel).toBeVisible()
  return panel
}

const row = (panel: Locator, text: string | RegExp) => panel.getByRole('listitem').filter({ hasText: text })

/** SQL of each visible query row; members of an open group sit inside their first query's row. */
const querySql = (panel: Locator) => panel.locator('[data-testid="backend-lens-query"] > [data-testid="backend-lens-sql"]')

/**
 * Query count of the open request, read from the Queries tab label. The Sanctum session adds its own
 * queries on top of a scenario's, so totals are never hard-coded.
 */
async function queryTotal(panel: Locator): Promise<number> {
  const label = await panel.getByTestId('backend-lens-tab-queries').textContent()
  return Number(label?.match(/\d+/)?.[0])
}

test('N+1 is collapsed into its first query and opens indented below it', async ({ page }) => {
  await page.goto('/books')
  await expect(page.locator('main table')).toBeVisible()

  await expect(page.getByTestId('backend-lens-badge-issues')).toBeVisible()
  const panel = await openPanel(page)
  await expect(panel.getByTestId('backend-lens-summary')).toContainText('1 N+1')

  const books = row(panel, /GET\/api\/books\d/)
  await expect(books.getByTestId('backend-lens-chip-n-plus-one')).toBeVisible()
  await books.click()

  const issue = panel.getByTestId('backend-lens-issue-n-plus-one')
  await expect(issue).toContainText('30×')
  await expect(issue).toContainText('BookResource.php:29')
  const total = await queryTotal(panel)
  expect(total).toBeGreaterThanOrEqual(31)

  // Collapsed: the 30 author queries are one row carrying the group toggle.
  await expect(querySql(panel)).toHaveCount(total - 29)
  const toggle = panel.getByTestId('backend-lens-group-toggle')
  await expect(toggle).toHaveText(/N\+1 ×30 · show 29 more/)

  // Clicking the issue opens the group right below its first query.
  await issue.click()
  // `has` locators are resolved inside each candidate row, so they start from the page, not the panel.
  const lead = panel.getByTestId('backend-lens-query').filter({ has: page.getByTestId('backend-lens-group-toggle') })
  const members = lead.getByTestId('backend-lens-group-members')
  await expect(members.getByTestId('backend-lens-query')).toHaveCount(29)
  await expect(querySql(panel)).toHaveCount(total)
  await expect(toggle).toHaveText(/· hide/)
  const indent = await members.evaluate(element => Number.parseFloat(getComputedStyle(element).marginLeft))
  expect(indent).toBeGreaterThan(0)

  // A second click on the issue closes the group again, a third one reopens it.
  await expect(issue).toHaveAttribute('aria-expanded', 'true')
  await issue.click()
  await expect(members).toHaveCount(0)
  await expect(issue).toHaveAttribute('aria-expanded', 'false')
  await issue.click()
  await expect(members.getByTestId('backend-lens-query')).toHaveCount(29)

  await toggle.click()
  await expect(members).toHaveCount(0)
  await expect(querySql(panel)).toHaveCount(total - 29)
})

test('eager loading removes the N+1', async ({ page }) => {
  await page.goto('/books')
  await page.getByLabel(/eager-load authors/).check()
  const panel = await openPanel(page)
  const eager = row(panel, '/api/books?eager=1')
  await expect(eager).toContainText(' q')
  await expect(eager.getByTestId('backend-lens-chip-n-plus-one')).toHaveCount(0)
  await eager.click()
  await expect(querySql(panel).filter({ hasText: /from "authors"/i })).toHaveCount(1)
  await expect(panel.getByTestId('backend-lens-group-toggle')).toHaveCount(0)
})

test('duplicate queries are reported with their counts', async ({ page }) => {
  await page.goto('/stats')
  const panel = await openPanel(page)
  const stats = row(panel, '/api/stats')
  await expect(stats.getByTestId('backend-lens-chip-duplicate')).toContainText('2 dup')
  await stats.click()
  const duplicates = panel.getByTestId('backend-lens-issue-duplicate')
  await expect(duplicates).toHaveCount(2)
  await expect(duplicates.filter({ hasText: '3×' })).toContainText(/count\(\*\).*"books"/i)
  await expect(duplicates.filter({ hasText: '2×' })).toContainText(/count\(\*\).*"authors"/i)

  // Clicking a query's toggle shows its duplicates under that very query, from their own call sites.
  const booksCount = panel.getByTestId('backend-lens-query').filter({
    has: page.getByTestId('backend-lens-group-toggle').filter({ hasText: 'duplicate ×3' }),
  })
  await booksCount.getByTestId('backend-lens-group-toggle').click()
  const members = booksCount.getByTestId('backend-lens-group-members').getByTestId('backend-lens-query')
  await expect(members).toHaveCount(2)
  for (const member of await members.all()) {
    await expect(member).toContainText(/count\(\*\).*"books"/i)
    await expect(member).toContainText('BookController.php:')
  }

  // The summary item and the chip drive the same group: the item closes what the chip opened.
  await duplicates.filter({ hasText: '3×' }).click()
  await expect(members).toHaveCount(0)
})

test('the slow query is flagged', async ({ page }) => {
  await page.goto('/slow')
  const panel = await openPanel(page)
  await expect(row(panel, '/api/slow').getByTestId('backend-lens-chip-slow')).toBeVisible()
})

test('repeated requests in one navigation are summarized', async ({ page }) => {
  await page.goto('/clients')
  await expect(page.locator('main td', { hasText: /^ok$/ })).toHaveCount(6)
  const panel = await openPanel(page)
  await expect(panel.getByTestId('backend-lens-repeated')).toContainText('6× GET /api/stats')
})

test('cache events are listed', async ({ page }) => {
  await page.goto('/cached')
  await expect(page.locator('main pre')).toContainText('"cache_hit": true')
  const panel = await openPanel(page)
  await row(panel, '/api/cached?fresh=1').click()
  await panel.getByTestId('backend-lens-tab-cache').click()
  const cache = panel.getByTestId('backend-lens-cache')
  await expect(cache).toContainText('miss')
  await expect(cache).toContainText('write')
  await expect(cache).toContainText('demo:top-books')

  await row(panel, /GET\/api\/cached\d/).click()
  await panel.getByTestId('backend-lens-tab-cache').click()
  await expect(panel.getByTestId('backend-lens-cache')).toContainText('hit')
})

test('the timeline puts queries on the request time axis', async ({ page }) => {
  await page.goto('/books')
  const panel = await openPanel(page)
  await row(panel, /GET\/api\/books\d/).click()
  await panel.getByTestId('backend-lens-tab-timeline').click()
  const total = await queryTotal(panel)
  const timeline = panel.getByTestId('backend-lens-timeline')
  await expect(timeline.locator('.bl-waterfall-query')).toHaveCount(total)
  await expect(timeline.locator('.bl-waterfall-event').first()).toBeVisible()
})

test('the DevTools tab page finds the app lens and renders the embedded panel', async ({ page }) => {
  await page.goto('/stats')
  await expect(page.locator('main pre')).toContainText('books')

  // Same nesting as Nuxt DevTools (app → iframe), without DevTools' own authorization flow.
  await page.evaluate(() => {
    const frame = document.createElement('iframe')
    frame.id = 'lens-tab'
    frame.src = '/__backend-lens/'
    frame.style.cssText = 'width: 1200px; height: 600px'
    document.body.appendChild(frame)
  })
  const tab = page.frameLocator('#lens-tab')
  const panel = tab.getByTestId('backend-lens-panel')
  await expect(panel).toBeVisible()
  await expect(tab.getByTestId('backend-lens-badge')).toHaveCount(0)
  await expect(panel.getByRole('listitem').filter({ hasText: '/api/stats' })).toHaveCount(1)

  // Live: a request made by the app appears in the tab.
  await page.evaluate(() => fetch('/api/slow'))
  await expect(panel.getByRole('listitem').filter({ hasText: '/api/slow' })).toHaveCount(1)
})
