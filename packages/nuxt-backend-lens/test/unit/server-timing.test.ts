// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveOptions } from '../../src/module'
import { createServerTimingAdapter } from '../../src/runtime/core/adapters/server-timing'
import { type BackendLens, createBackendLens } from '../../src/runtime/core/collector'
import { defaultOptions } from '../../src/runtime/core/options'
import { parseServerTimingHeader } from '../../src/runtime/core/server-timing'
import { capturedResponse, loadFixture } from './helpers'

describe('parseServerTimingHeader', () => {
  it('parses the W3C grammar', () => {
    expect(parseServerTimingHeader('db;dur=53.2;desc="Database", cache;desc=hit, total;dur=120')).toEqual([
      { name: 'db', durationMs: 53.2, description: 'Database' },
      { name: 'cache', durationMs: 0, description: 'hit' },
      { name: 'total', durationMs: 120, description: undefined },
    ])
  })

  it('keeps commas and semicolons inside quoted descriptions, handles escapes and spacing', () => {
    expect(parseServerTimingHeader('a ; desc = "x, y; z" ; dur = 1.5,b;desc="say \\"hi\\""')).toEqual([
      { name: 'a', durationMs: 1.5, description: 'x, y; z' },
      { name: 'b', durationMs: 0, description: 'say "hi"' },
    ])
  })

  it('ignores unknown params and malformed durations, survives garbage', () => {
    expect(parseServerTimingHeader('m;dur=abc;foo=bar')).toEqual([{ name: 'm', durationMs: 0, description: undefined }])
    expect(parseServerTimingHeader('')).toEqual([])
    expect(parseServerTimingHeader(' , ;;, ')).toEqual([])
  })

  it('reads the header Clockwork sends', () => {
    const { response } = loadFixture('clockwork', 'books-n-plus-one')
    const metrics = parseServerTimingHeader(response.headers.get('server-timing')!)
    expect(metrics.map(metric => metric.name)).toEqual(['app', 'db', 'timeline-event-0'])
    expect(metrics[1]).toMatchObject({ description: 'Database' })
  })
})

describe('server-timing adapter', () => {
  const adapter = createServerTimingAdapter(defaultOptions.adapters.serverTiming)
  const header = 'total;dur=40.5;desc="Total", db;dur=12;desc="Database", sql;dur=3, cache;dur=1;desc="Cache"'

  it('turns a readable header into an inline, timing-only record', () => {
    const ref = adapter.detect(capturedResponse('http://a.test/api/x', { 'Server-Timing': header }))
    expect(ref).toMatchObject({ adapter: 'server-timing', url: 'http://a.test/api/x' })
    expect(ref!.inline).toHaveLength(4)

    const details = adapter.parse(ref!.inline, ref!)
    expect(details).toMatchObject({ durationMs: 40.5, queriesDurationMs: 15, queries: [], logs: [] })
    expect(details.timeline.map(event => event.label)).toEqual(['Total (total)', 'Database (db)', 'sql', 'Cache (cache)'])
    expect(details.note).toMatch(/Timing only/)
  })

  it('ignores responses without the header or without metrics', () => {
    expect(adapter.detect(capturedResponse('http://a.test/x', {}))).toBeNull()
    expect(adapter.detect(capturedResponse('http://a.test/x', { 'server-timing': ' , ' }))).toBeNull()
  })

  it('gives every record its own id', () => {
    const first = adapter.detect(capturedResponse('http://a.test/x', { 'server-timing': 'db;dur=1' }))
    const second = adapter.detect(capturedResponse('http://a.test/x', { 'server-timing': 'db;dur=1' }))
    expect(first!.id).not.toBe(second!.id)
  })

  it('honours configured header and metric names', () => {
    const custom = createServerTimingAdapter({ enabled: true, header: 'x-timing', databaseMetrics: ['pg'], totalMetrics: ['request'] })
    const ref = custom.detect(capturedResponse('http://a.test/x', { 'x-timing': 'request;dur=9, pg;dur=4, db;dur=100' }))!
    expect(custom.parse(ref.inline, ref)).toMatchObject({ durationMs: 9, queriesDurationMs: 4 })
  })
})

describe('server-timing in the collector', () => {
  let lens: BackendLens | undefined
  afterEach(() => lens?.destroy())

  it('loses to a debug package and loads inline records without fetching', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://app.test')
      const headers: Record<string, string> = { 'server-timing': 'db;dur=5;desc="Database", total;dur=20' }
      if (url.pathname === '/api/with-clockwork') {
        headers['x-clockwork-id'] = 'cw-1'
      }
      const response = new Response('{}', { headers })
      Object.defineProperty(response, 'url', { value: url.href })
      return response
    })
    window.fetch = fetchMock as unknown as typeof fetch
    lens = createBackendLens(resolveOptions({ prefetch: { enabled: false } }), { window, observeServerTiming: () => () => {} })

    await fetch('/api/plain')
    await fetch('/api/with-clockwork')
    expect(lens.store.entries.map(entry => entry.ref?.adapter)).toEqual(['server-timing', 'clockwork'])

    const calls = fetchMock.mock.calls.length
    await lens.load(lens.store.entries[0]!.key)
    expect(fetchMock.mock.calls.length).toBe(calls)
    expect(lens.store.entries[0]!.details).toMatchObject({ adapter: 'server-timing', durationMs: 20, queriesDurationMs: 5 })
  })

  it('can be switched off', async () => {
    window.fetch = vi.fn(async () => new Response('{}', { headers: { 'server-timing': 'db;dur=1' } })) as unknown as typeof fetch
    lens = createBackendLens(resolveOptions({ adapters: { serverTiming: { enabled: false } } }), { window, observeServerTiming: () => () => {} })
    await fetch('/api/plain')
    expect(lens.store.entries).toHaveLength(0)
  })
})
