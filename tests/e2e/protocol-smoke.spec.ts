import { expect, test, type Page } from '@playwright/test'

// Everything the module relies on must be observable from page JS through the same-origin proxy:
// the debug id header, the record JSON and Server-Timing.

/** Runs fetch() inside the page and reports what page JS can see. */
async function probeFromPage(page: Page, url: string) {
  return page.evaluate(async (target) => {
    // An observer, as in the module: the resource timing buffer overflows in `nuxt dev`, and the
    // entry arrives after fetch() has resolved (docs/architecture.md).
    const entryPromise = new Promise<PerformanceResourceTiming | undefined>((resolve) => {
      const observer = new PerformanceObserver((list) => {
        const match = (list.getEntries() as PerformanceResourceTiming[]).find(candidate => candidate.name.endsWith(target))
        if (match) {
          observer.disconnect()
          resolve(match)
        }
      })
      observer.observe({ type: 'resource' })
      setTimeout(() => {
        observer.disconnect()
        resolve(undefined)
      }, 2000)
    })

    const response = await fetch(target, { headers: { Accept: 'application/json' } })
    const id = response.headers.get('x-clockwork-id')
    const path = response.headers.get('x-clockwork-path')
    await response.arrayBuffer()
    const entry = await entryPromise

    return {
      status: response.status,
      id,
      path,
      serverTiming: entry?.serverTiming.map(timing => ({ name: timing.name, duration: timing.duration })) ?? [],
    }
  }, url)
}

async function fetchRecord(page: Page, id: string, path: string | null) {
  return page.evaluate(async ({ id, path }) => {
    const base = (path ?? '/__clockwork/').replace(/\/?$/, '/')
    for (const delay of [0, 100, 300, 1000]) {
      await new Promise(resolve => setTimeout(resolve, delay))
      const response = await fetch(`${base}${id}`)
      if (response.ok) return response.json()
    }
    throw new Error(`record ${id} not found`)
  }, { id, path })
}

// These checks are about the Clockwork wire protocol. Debugbar's Clockwork emulation is broken under
// Octane (docs/upstream/laravel-debugbar-octane-clockwork.md), so they only run on a Clockwork stand.
test.skip(process.env.DEBUG_BACKEND === 'debugbar', 'Clockwork protocol checks need DEBUG_BACKEND=clockwork')

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'nuxt-backend-lens demo' })).toBeVisible()
})

test('debug id, record and Server-Timing are readable from page JS', async ({ page }) => {
  const probe = await probeFromPage(page, '/api/books')

  expect(probe.status).toBe(200)
  expect(probe.id).toBeTruthy()
  expect(probe.serverTiming.map(timing => timing.name)).toContain('db')

  const record = await fetchRecord(page, probe.id!, probe.path)
  expect(record.id).toBe(probe.id)
  // Browser requests are stateful (Sanctum session), so session queries come on top of the
  // scenario's own 1 + 30. Clockwork inlines bindings, hence the per-table match.
  const queries = record.databaseQueries.map((query: { query: string }) => query.query)
  expect(queries.filter((sql: string) => sql.startsWith('SELECT * FROM "books"'))).toHaveLength(1)
  expect(queries.filter((sql: string) => sql.startsWith('SELECT * FROM "authors" WHERE'))).toHaveLength(30)
})

test('error responses carry a debug id too', async ({ page }) => {
  const probe = await probeFromPage(page, '/api/boom')

  expect(probe.status).toBe(500)
  expect(probe.id).toBeTruthy()
})

test('every HTTP client on /clients produces a response with a debug id', async ({ page }) => {
  const statsResponses: string[] = []
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/api/stats') {
      statsResponses.push(response.headers()['x-clockwork-id'] ?? '')
    }
  })

  await page.getByRole('link', { name: 'HTTP clients' }).click()
  await expect(page.locator('td', { hasText: /^ok$/ })).toHaveCount(6)

  expect(statsResponses).toHaveLength(6)
  expect(statsResponses.every(Boolean)).toBe(true)
})

test('sanctum login and a write request go through with debug ids', async ({ page }) => {
  await page.getByRole('link', { name: 'Write + auth' }).click()
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByText('Logged in as')).toBeVisible()

  const responsePromise = page.waitForResponse(response =>
    /\/api\/books\/\d+\/reviews$/.test(new URL(response.url()).pathname),
  )
  await page.getByRole('button', { name: 'Post review' }).click()
  const response = await responsePromise

  expect(response.status()).toBe(201)
  expect(response.headers()['x-clockwork-id']).toBeTruthy()
})

test('every scenario page loads without errors except the exception page', async ({ page }) => {
  for (const name of ['N+1: books', 'Duplicate queries', 'Slow query', 'Cache', 'Logs']) {
    await page.getByRole('link', { name }).click()
    await expect(page.locator('.error')).toHaveCount(0)
  }

  await page.getByRole('link', { name: 'Exception' }).click()
  await expect(page.locator('.error')).toContainText('500')
})
