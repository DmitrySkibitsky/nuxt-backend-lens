// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveOptions } from '../../src/module'
import { type BackendLens, createBackendLens } from '../../src/runtime/core/collector'
import type { ModuleOptions } from '../../src/module'
import type { ServerTimingEntry } from '../../src/runtime/core/server-timing'
import { loadFixture } from './helpers'

const ORIGIN = 'http://app.test'

interface FakeBackend {
  fetch: ReturnType<typeof vi.fn>
  calls: string[]
}

/**
 * A fetch that answers `/api/*` with the headers of a captured fixture and the record endpoints
 * with the fixture's record — the real wire format end to end, without a server.
 */
function fakeBackend(options: { recordMisses?: number } = {}): FakeBackend {
  const books = loadFixture('clockwork', 'books-n-plus-one')
  const logs = loadFixture('debugbar', 'logs')
  const recordId = (books.record as { id: string }).id
  const debugbarId = (logs.record as { __meta: { id: string } }).__meta.id
  let misses = options.recordMisses ?? 0
  const calls: string[] = []

  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, ORIGIN)
    calls.push(url.pathname + url.search)
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => {
      const response = new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
      Object.defineProperty(response, 'url', { value: url.href })
      return response
    }
    if (url.pathname === '/api/books') {
      return json({}, 200, { 'x-clockwork-id': recordId })
    }
    if (url.pathname === '/api/logs') {
      return json({}, 200, { 'phpdebugbar-id': debugbarId, 'x-clockwork-id': debugbarId })
    }
    if (url.pathname === '/api/plain') {
      return json({})
    }
    if (url.pathname === `/__clockwork/${recordId}`) {
      if (misses-- > 0) {
        return json({ message: 'not yet' }, 404)
      }
      return json(books.record)
    }
    if (url.pathname === '/_debugbar/open' && url.searchParams.get('id') === debugbarId) {
      return json(logs.record)
    }
    return json({ message: 'unknown' }, 404)
  })
  return { fetch, calls }
}

let lens: BackendLens | undefined
let timingListener: ((entry: ServerTimingEntry) => void) | undefined

function startLens(backend: FakeBackend, input: ModuleOptions = {}): BackendLens {
  window.fetch = backend.fetch as unknown as typeof fetch
  lens = createBackendLens(resolveOptions({ retryDelays: [0, 1, 1], ...input }), {
    window,
    observeServerTiming: (listener) => {
      timingListener = listener
      return () => {}
    },
  })
  return lens
}

afterEach(() => {
  lens?.destroy()
  lens = undefined
})

async function settle() {
  await vi.waitFor(() => {
    expect(lens!.store.entries.every(entry => !['idle', 'loading'].includes(entry.detailsState))).toBe(true)
  })
}

describe('collector', () => {
  it('records detected requests, prefetches their records and leaves the app response intact', async () => {
    const backend = fakeBackend()
    startLens(backend)

    const response = await fetch('/api/books')
    expect(await response.json()).toEqual({})
    await settle()

    const [entry] = lens!.store.entries
    expect(entry).toMatchObject({ method: 'GET', path: '/api/books', status: 200, detailsState: 'loaded', initiator: 'fetch' })
    expect(entry!.details?.queries).toHaveLength(31)
    // The record was loaded with the original fetch, so it is not listed as a request.
    expect(lens!.store.entries).toHaveLength(1)
  })

  it('prefers the configured adapter when a response carries several ids', async () => {
    startLens(fakeBackend())
    await fetch('/api/logs')
    await settle()
    expect(lens!.store.entries[0]!.ref?.adapter).toBe('debugbar')
    expect(lens!.store.entries[0]!.details?.logs).toHaveLength(4)
  })

  it('retries a record that is not persisted yet', async () => {
    const backend = fakeBackend({ recordMisses: 2 })
    startLens(backend)
    await fetch('/api/books')
    await settle()
    expect(lens!.store.entries[0]!.detailsState).toBe('loaded')
    expect(backend.calls.filter(call => call.startsWith('/__clockwork/'))).toHaveLength(3)
  })

  it('gives up after the configured attempts and reports the error', async () => {
    startLens(fakeBackend({ recordMisses: 10 }))
    await fetch('/api/books')
    await settle()
    expect(lens!.store.entries[0]).toMatchObject({ detailsState: 'error' })
    expect(lens!.store.entries[0]!.error).toMatch(/HTTP 404/)
  })

  it('loads lazily when prefetch is off', async () => {
    const backend = fakeBackend()
    startLens(backend, { prefetch: { enabled: false } })
    await fetch('/api/books')
    expect(lens!.store.entries[0]!.detailsState).toBe('idle')
    await lens!.load(lens!.store.entries[0]!.key)
    expect(lens!.store.entries[0]!.detailsState).toBe('loaded')
  })

  it('lists plain requests only when included, and never excluded ones', async () => {
    startLens(fakeBackend(), { include: ['/api/plain'], exclude: ['/api/logs'] })
    await fetch('/api/plain')
    await fetch('/api/logs')
    await fetch('/other')
    expect(lens!.store.entries.map(entry => [entry.path, entry.detailsState])).toEqual([['/api/plain', 'none']])
  })

  it('groups requests by navigation', async () => {
    startLens(fakeBackend(), { prefetch: { enabled: false } })
    await fetch('/api/books')
    lens!.setRoute('/books')
    await fetch('/api/books')
    lens!.setRoute('/stats')
    await fetch('/api/books')
    expect(lens!.store.entries.map(entry => entry.navigationId)).toEqual([1, 1, 2])
    expect(lens!.store.navigations.map(item => [item.id, item.route])).toEqual([[1, '/books'], [2, '/stats']])
  })

  it('attaches Server-Timing whether it arrives after or before the response', async () => {
    startLens(fakeBackend(), { prefetch: { enabled: false } })
    await fetch('/api/books')
    const entry = lens!.store.entries[0]!
    timingListener!({ url: entry.url, startTime: entry.startTime + 2, metrics: [{ name: 'db', durationMs: 7 }] })
    expect(lens!.store.entries[0]!.serverTiming).toEqual([{ name: 'db', durationMs: 7 }])

    timingListener!({ url: `${ORIGIN}/api/books`, startTime: performance.now(), metrics: [{ name: 'db', durationMs: 9 }] })
    await fetch('/api/books')
    expect(lens!.store.entries[1]!.serverTiming).toEqual([{ name: 'db', durationMs: 9 }])
  })

  it('captures XMLHttpRequest too', () => {
    // Stub the transport before the lens wraps it: happy-dom would really send the request.
    const realSend = XMLHttpRequest.prototype.send
    XMLHttpRequest.prototype.send = vi.fn()
    try {
      startLens(fakeBackend(), { prefetch: { enabled: false } })
      const xhr = new XMLHttpRequest()
      Object.defineProperty(xhr, 'status', { value: 200 })
      Object.defineProperty(xhr, 'responseURL', { value: `${ORIGIN}/api/xhr` })
      vi.spyOn(xhr, 'getResponseHeader').mockImplementation(name => (name === 'x-clockwork-id' ? 'xhr-1' : null))
      xhr.open('GET', '/api/xhr')
      xhr.send()
      xhr.dispatchEvent(new Event('loadend'))
      expect(lens!.store.entries.map(entry => [entry.initiator, entry.method, entry.path, entry.ref?.id]))
        .toEqual([['xhr', 'GET', '/api/xhr', 'xhr-1']])
    }
    finally {
      lens?.destroy()
      lens = undefined
      XMLHttpRequest.prototype.send = realSend
    }
  })

  it('restores the original fetch and XHR on destroy', () => {
    const backend = fakeBackend()
    const { open, send } = XMLHttpRequest.prototype
    startLens(backend)
    expect(window.fetch).not.toBe(backend.fetch)
    expect(XMLHttpRequest.prototype.send).not.toBe(send)
    lens!.destroy()
    lens = undefined
    expect(window.fetch).toBe(backend.fetch)
    expect(XMLHttpRequest.prototype.open).toBe(open)
    expect(XMLHttpRequest.prototype.send).toBe(send)
  })

  it('does not stack patches when started twice (HMR)', async () => {
    const backend = fakeBackend()
    startLens(backend, { prefetch: { enabled: false } })
    const first = lens!
    startLens(backend, { prefetch: { enabled: false } })
    await fetch('/api/books')
    expect(first.store.entries).toHaveLength(0)
    expect(lens!.store.entries).toHaveLength(1)
  })

  it('never breaks the application when a listener fails', async () => {
    const backend = fakeBackend()
    startLens(backend)
    lens!.store.subscribe(() => {
      throw new Error('ui crashed')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const response = await fetch('/api/books')
    expect(response.status).toBe(200)
    warn.mockRestore()
  })

  it('propagates network errors of the application untouched', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    window.fetch = failing as unknown as typeof fetch
    lens = createBackendLens(resolveOptions({}), { window, observeServerTiming: () => () => {} })
    await expect(fetch('/api/books')).rejects.toThrow('Failed to fetch')
    expect(lens.store.entries).toHaveLength(0)
  })
})
