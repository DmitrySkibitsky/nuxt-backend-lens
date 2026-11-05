import { expect, test } from '@playwright/test'

// The "Backend requests" layer of the Vue DevTools timeline (devtools-kit behaviour:
// docs/architecture.md). The test plays the connecting client's part — high-perf mode off,
// `toggleApp` on the Nuxt app (which runs buffered plugin setups), `clientConnected` — and reads
// events from the `timelineEventAdded` context hook every plugin event passes through.

interface KitEvent {
  layerId: string
  event: { title?: string, subtitle?: string, groupId?: string, logType?: string }
}

type KitWindow = Window & {
  __VUE_DEVTOOLS_KIT_TIMELINE_LAYERS?: { id: string, label: string }[]
  __VUE_DEVTOOLS_KIT_GLOBAL_STATE__: Record<string, unknown>
  __VUE_DEVTOOLS_KIT_APP_RECORDS__: { id: string, app: { _container?: Element | null } }[]
  __VUE_DEVTOOLS_KIT_CONTEXT__: {
    hooks: { hook(name: string, fn: (payload: { options: unknown }) => void): void, callHook(name: string, payload: unknown): Promise<void> }
    api: { toggleApp(id: string): void }
  }
  __lensTimelineEvents: KitEvent[]
}

test('requests made before a Vue DevTools client connects are replayed onto its timeline layer', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('backend-lens-badge')).toBeVisible()

  await page.evaluate(() => {
    const kit = window as KitWindow
    kit.__lensTimelineEvents = []
    kit.__VUE_DEVTOOLS_KIT_CONTEXT__.hooks.hook('timelineEventAdded', ({ options }) => kit.__lensTimelineEvents.push(options as KitEvent))
  })

  await page.getByRole('link', { name: 'N+1: books' }).click()
  await expect(page.locator('main table')).toBeVisible()
  await expect(page.getByTestId('backend-lens-badge-issues')).toBeVisible()

  const booksEvents = () => page.evaluate(() => (window as KitWindow).__lensTimelineEvents
    .filter(item => item.layerId === 'backend-lens' && item.event.title === 'GET /api/books')
    .map(item => item.event))

  // No client yet: devtools-kit drops events, so nothing has gone through.
  expect(await booksEvents()).toEqual([])

  await page.evaluate(async () => {
    const kit = window as KitWindow
    const state = kit.__VUE_DEVTOOLS_KIT_GLOBAL_STATE__
    const oldState = { ...state }
    state.highPerfModeEnabled = false
    const nuxtApp = kit.__VUE_DEVTOOLS_KIT_APP_RECORDS__.find(record => record.app._container?.id === '__nuxt')!
    kit.__VUE_DEVTOOLS_KIT_CONTEXT__.api.toggleApp(nuxtApp.id)
    state.clientConnected = true
    await kit.__VUE_DEVTOOLS_KIT_CONTEXT__.hooks.callHook('devtoolsConnectedUpdated', { state, oldState })
  })

  await expect.poll(() => page.evaluate(() => ((window as KitWindow).__VUE_DEVTOOLS_KIT_TIMELINE_LAYERS ?? [])
    .filter(layer => layer.id === 'backend-lens')
    .map(layer => layer.label))).toEqual(['Backend requests'])
  await expect.poll(async () => (await booksEvents()).length).toBe(2)
  const [start, end] = await booksEvents()
  expect(start!.groupId).toBe(end!.groupId)
  expect(start!.subtitle).toBe('click “N+1: books”')
  expect(end!.subtitle).toMatch(/^200 · \d+ ms · \d+ q · \d+ ms DB · 1 N\+1$/)
  expect(end!.logType).toBe('warning')

  // Live from now on: a new request is emitted as it happens.
  await page.getByRole('link', { name: 'Slow query' }).click()
  await expect.poll(() => page.evaluate(() => (window as KitWindow).__lensTimelineEvents
    .filter(item => item.layerId === 'backend-lens' && item.event.title === 'GET /api/slow').length)).toBe(2)
  // That request made the emitter sync again: a duplicate replay of the books events would show now.
  expect(await booksEvents()).toHaveLength(2)
})
