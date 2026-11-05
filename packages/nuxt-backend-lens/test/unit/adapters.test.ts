import { describe, expect, it } from 'vitest'
import { createClockworkAdapter } from '../../src/runtime/core/adapters/clockwork'
import { createDebugbarAdapter } from '../../src/runtime/core/adapters/debugbar'
import { defaultOptions } from '../../src/runtime/core/options'
import type { BackendLensAdapter, DebugDetails } from '../../src/runtime/core/types'
import { capturedResponse, FIXTURE_ORIGIN, loadFixture } from './helpers'

const clockwork = createClockworkAdapter(defaultOptions.adapters.clockwork)
const debugbar = createDebugbarAdapter(defaultOptions.adapters.debugbar)

function parseFixture(adapter: BackendLensAdapter, source: 'clockwork' | 'debugbar', name: string): DebugDetails {
  const { response, record } = loadFixture(source, name)
  const ref = adapter.detect(response)
  expect(ref, `${source}/${name} must be detected`).not.toBeNull()
  return adapter.parse(record, ref!)
}

const sources = [
  { source: 'clockwork', adapter: clockwork },
  { source: 'debugbar', adapter: debugbar },
] as const

describe('clockwork adapter: detect', () => {
  it('uses the configured endpoint when the response has no path header', () => {
    const ref = clockwork.detect(capturedResponse(`${FIXTURE_ORIGIN}/api/books`, { 'X-Clockwork-Id': '123-abc' }))
    expect(ref).toEqual({
      adapter: 'clockwork',
      id: '123-abc',
      url: `${FIXTURE_ORIGIN}/__clockwork/123-abc`,
      webUrl: `${FIXTURE_ORIGIN}/clockwork/app`,
    })
  })

  it('resolves a relative X-Clockwork-Path from the server root (Debugbar emulation)', () => {
    const ref = clockwork.detect(capturedResponse(`${FIXTURE_ORIGIN}/api/deep/books`, {
      'x-clockwork-id': '01ABC',
      'x-clockwork-path': '_debugbar/clockwork/',
    }))
    expect(ref?.url).toBe(`${FIXTURE_ORIGIN}/_debugbar/clockwork/01ABC`)
  })

  it('resolves against the response origin, not the page (cross-origin API)', () => {
    const ref = clockwork.detect(capturedResponse('https://api.example.test/v1/books', { 'x-clockwork-id': 'id1' }))
    expect(ref?.url).toBe('https://api.example.test/__clockwork/id1')
  })

  it('keeps an absolute X-Clockwork-Path on the response origin', () => {
    const ref = clockwork.detect(capturedResponse('https://api.example.test/v1/books', {
      'x-clockwork-id': 'id1',
      'x-clockwork-path': 'https://api.example.test/tools/__clockwork/',
    }))
    expect(ref?.url).toBe('https://api.example.test/tools/__clockwork/id1')
  })

  it.each([
    'https://app.example.test/api/logout?',
    '//evil.example.test/',
    '/\\evil.example.test/',
    'https://api.example.test:8443/__clockwork/',
    'javascript://%0Aalert(document.cookie)//',
  ])('falls back to the endpoint when X-Clockwork-Path %s leaves the response origin', (path) => {
    const ref = clockwork.detect(capturedResponse('https://api.example.test/v1/books', {
      'x-clockwork-id': 'id1',
      'x-clockwork-path': path,
    }))
    expect(ref?.url).toBe('https://api.example.test/__clockwork/id1')
  })

  it('honours custom header names and web UI template', () => {
    const adapter = createClockworkAdapter({
      ...defaultOptions.adapters.clockwork,
      idHeader: 'x-debug-id',
      webUi: '/tools/clockwork#{id}',
    })
    const ref = adapter.detect(capturedResponse(`${FIXTURE_ORIGIN}/api`, { 'x-debug-id': 'a b' }))
    expect(ref?.webUrl).toBe(`${FIXTURE_ORIGIN}/tools/clockwork#a%20b`)
    expect(adapter.detect(capturedResponse(`${FIXTURE_ORIGIN}/api`, { 'x-clockwork-id': 'x' }))).toBeNull()
  })

  it('hides the web UI link when disabled', () => {
    const adapter = createClockworkAdapter({ ...defaultOptions.adapters.clockwork, webUi: false })
    expect(adapter.detect(capturedResponse(`${FIXTURE_ORIGIN}/api`, { 'x-clockwork-id': 'x' }))?.webUrl).toBeUndefined()
  })
})

describe('debugbar adapter: detect', () => {
  it('points at the open handler under the configured prefix', () => {
    const ref = debugbar.detect(capturedResponse(`${FIXTURE_ORIGIN}/api/books`, { 'phpdebugbar-id': '01M6M3FBG3H2' }))
    expect(ref?.url).toBe(`${FIXTURE_ORIGIN}/_debugbar/open?op=get&id=01M6M3FBG3H2`)
  })

  it('ignores responses without its header', () => {
    expect(debugbar.detect(capturedResponse(`${FIXTURE_ORIGIN}/api`, { 'x-clockwork-id': 'x' }))).toBeNull()
  })
})

describe.each(sources)('$source adapter: parse real records', ({ source, adapter }) => {
  it('reports the N+1 pattern with call sites', () => {
    const details = parseFixture(adapter, source, 'books-n-plus-one')
    expect(details.adapter).toBe(source)
    expect(details.uri).toBe('/api/books')
    expect(details.method).toBe('GET')
    expect(details.status).toBe(200)
    expect(details.controller).toBe('App\\Http\\Controllers\\Api\\BookController@index')
    expect(details.queries).toHaveLength(31)

    const authorQueries = details.queries.filter(query => /from "authors"/i.test(query.sql))
    expect(authorQueries).toHaveLength(30)
    for (const query of authorQueries) {
      expect(query.callSite?.file).toMatch(/app\/Http\/Resources\/BookResource\.php$/)
      expect(query.callSite?.line).toBe(29)
      expect(query.callSite?.isVendor).toBe(false)
    }
    expect(details.queries[0]!.callSite?.file).toMatch(/BookController\.php$/)

    const total = details.queries.reduce((sum, query) => sum + query.durationMs, 0)
    expect(details.queriesDurationMs).toBeCloseTo(total, 0)
    expect(details.durationMs).toBeGreaterThan(details.queriesDurationMs)
  })

  it('reports eager loading as two queries', () => {
    expect(parseFixture(adapter, source, 'books-eager').queries).toHaveLength(2)
  })

  it('reports identical repeated queries', () => {
    const sql = parseFixture(adapter, source, 'stats-duplicates').queries.map(query => query.sql)
    expect(new Set(sql).size).toBeLessThan(sql.length)
  })

  it('reports the slow query duration in milliseconds', () => {
    const [query] = parseFixture(adapter, source, 'slow').queries
    expect(query!.durationMs).toBeGreaterThanOrEqual(300)
    expect(query!.durationMs).toBeLessThan(5000)
  })

  it('normalizes cache events', () => {
    expect(parseFixture(adapter, source, 'cached-miss').cache.map(event => event.type))
      .toEqual(['delete', 'miss', 'miss', 'write'])
    const hit = parseFixture(adapter, source, 'cached-hit').cache
    expect(hit.map(event => event.type)).toEqual(['hit', 'hit'])
    expect(hit.every(event => event.key === 'demo:top-books')).toBe(true)
  })

  it('normalizes log entries: bare message, level, context', () => {
    const logs = parseFixture(adapter, source, 'logs').logs
    expect(logs.map(entry => [entry.level, entry.message])).toEqual([
      ['debug', 'Demo debug message'],
      ['info', 'Demo info message'],
      ['warning', 'Demo warning message'],
      ['error', 'Demo error message'],
    ])
    expect(logs[0]!.context).toEqual({ scenario: 'logs' })
    expect(logs[3]!.context).toEqual({ reason: 'just a demo' })
  })

  it('reports the exception of a 500', () => {
    const details = parseFixture(adapter, source, 'boom')
    expect(details.status).toBe(500)
    expect(details.exceptions).toHaveLength(1)
    expect(details.exceptions[0]).toMatchObject({ type: 'RuntimeException', message: 'Demo exception from /api/boom', line: 78 })
    expect(details.exceptions[0]!.file).toMatch(/ScenarioController\.php$/)
  })

  it('provides a timeline relative to the request start', () => {
    const timeline = parseFixture(adapter, source, 'books-n-plus-one').timeline
    expect(timeline.length).toBeGreaterThan(0)
    for (const event of timeline) {
      expect(event.startMs).toBeGreaterThanOrEqual(0)
      expect(event.durationMs).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('debugbar adapter: vendor quirks', () => {
  it('ignores the Clockwork emulation collector, which may hold another request under Octane', () => {
    const { response, record } = loadFixture('debugbar', 'books-n-plus-one')
    const poisoned = { ...(record as object), clockwork: { uri: '/someone/else', headers: { cookie: ['secret'] } } }
    const details = debugbar.parse(poisoned, debugbar.detect(response)!)
    expect(details.uri).toBe('/api/books')
    expect(JSON.stringify(details)).not.toContain('/someone/else')
  })

  it('drops non-query statements such as "Connection Established"', () => {
    const { response, record } = loadFixture('debugbar', 'slow')
    const raw = structuredClone(record) as { queries: { statements: unknown[] } }
    raw.queries.statements.unshift({ sql: 'Connection Established', type: 'transaction', params: [], duration: 0 })
    expect(debugbar.parse(raw, debugbar.detect(response)!).queries.map(query => query.sql))
      .not.toContain('Connection Established')
  })
})

describe('clockwork adapter: vendor quirks', () => {
  it('drops configured pseudo-statements (Debugbar emulation)', () => {
    const { response, record } = loadFixture('clockwork', 'slow')
    const raw = structuredClone(record) as { databaseQueries: unknown[] }
    raw.databaseQueries.unshift({ query: 'Connection Established', duration: 0 })
    expect(clockwork.parse(raw, clockwork.detect(response)!).queries).toHaveLength(1)
  })

  it('survives malformed records', () => {
    const ref = clockwork.detect(capturedResponse(`${FIXTURE_ORIGIN}/api`, { 'x-clockwork-id': 'x' }))!
    expect(clockwork.parse(null, ref)).toMatchObject({ id: 'x', queries: [], logs: [], cache: [] })
    expect(debugbar.parse('nonsense', { ...ref, adapter: 'debugbar' })).toMatchObject({ id: 'x', queries: [] })
  })
})
