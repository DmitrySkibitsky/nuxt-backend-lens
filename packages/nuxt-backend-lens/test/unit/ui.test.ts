// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { type App, createApp, h, nextTick } from 'vue'
import { createClockworkAdapter } from '../../src/runtime/core/adapters/clockwork'
import { analyzeDetails } from '../../src/runtime/core/analysis'
import { defaultOptions } from '../../src/runtime/core/options'
import { logLevelClass } from '../../src/runtime/ui/format'
import QueriesTab from '../../src/runtime/ui/QueriesTab.vue'
import { loadFixture } from './helpers'

let app: App | undefined

afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.innerHTML = ''
})

describe('QueriesTab', () => {
  it('opens the collapsed group of a slow query it scrolls to, and flashes that query', async () => {
    const adapter = createClockworkAdapter(defaultOptions.adapters.clockwork)
    const { response, record } = loadFixture('clockwork', 'books-n-plus-one')
    const details = adapter.parse(record, adapter.detect(response)!)
    const options = { nPlusOneThreshold: 3, slowQueryMs: 100 }
    const group = analyzeDetails(details, options).issues.find(issue => issue.kind === 'n+1')!
    // A member of the N+1 group (not its first query) becomes slow.
    const member = group.indexes[2]!
    const queries = details.queries.map((query, index) => (index === member ? { ...query, durationMs: 500 } : query))
    const analysis = analyzeDetails({ ...details, queries }, options)

    const container = document.createElement('div')
    document.body.appendChild(container)
    app = createApp({
      render: () => h(QueriesTab, { queries, analysis, slowQueryMs: options.slowQueryMs, sqlOptions: defaultOptions.sql }),
    })
    app.mount(container)
    expect(container.querySelector(`[data-index="${member}"]`)).toBeNull()

    container.querySelector<HTMLButtonElement>('[data-testid="backend-lens-issue-slow"]')!.click()
    await nextTick()
    await nextTick()
    const row = container.querySelector(`[data-index="${member}"]`)
    expect(row).not.toBeNull()
    expect(row!.classList.contains('bl-flash')).toBe(true)
  })
})

describe('logLevelClass', () => {
  it('builds classes from known levels only', () => {
    expect(logLevelClass('warning')).toBe('bl-level-warning')
    expect(logLevelClass('ERROR')).toBe('bl-level-error')
    expect(logLevelClass('x bl-root')).toBe('bl-level-other')
  })
})
