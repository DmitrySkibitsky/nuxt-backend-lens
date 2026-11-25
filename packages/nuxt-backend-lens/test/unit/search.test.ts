import { describe, expect, it } from 'vitest'
import { createClockworkAdapter } from '../../src/runtime/core/adapters/clockwork'
import { defaultOptions } from '../../src/runtime/core/options'
import { describeHits, searchEntries } from '../../src/runtime/core/search'
import type { DebugDetails, RequestEntry } from '../../src/runtime/core/types'
import { loadFixture } from './helpers'

const adapter = createClockworkAdapter(defaultOptions.adapters.clockwork)

function details(name: string): DebugDetails {
  const { response, record } = loadFixture('clockwork', name)
  return adapter.parse(record, adapter.detect(response)!)
}

const entry = (key: number, path: string, extra: Partial<RequestEntry> = {}): RequestEntry => ({
  key,
  method: 'GET',
  url: `http://a.test${path}`,
  path,
  status: 200,
  startTime: key,
  durationMs: 1,
  initiator: 'fetch',
  navigationId: 1,
  serverTiming: [],
  detailsState: 'loaded',
  ...extra,
})

const keys = (items: readonly { key: number }[]) => items.map(item => item.key)

describe('searchEntries', () => {
  const entries = [
    entry(1, '/api/books', { details: details('books-n-plus-one') }),
    entry(2, '/api/logs', { details: details('logs') }),
    entry(3, '/api/cached', { details: details('cached-hit') }),
    entry(4, '/api/boom', { status: 500, details: details('boom') }),
    entry(5, '/api/authors', { detailsState: 'idle' }),
  ]

  it('returns every request, in order, for a blank query', () => {
    expect(keys(searchEntries(entries, '  ').requests)).toEqual([1, 2, 3, 4, 5])
    expect(searchEntries(entries, '').content).toEqual([])
  })

  it('lists request matches first and record matches after them', () => {
    // "authors" is the path of request 5 and a table the N+1 queries of request 1 read.
    const result = searchEntries(entries, 'AUTHORS')
    expect(keys(result.requests)).toEqual([5])
    expect(result.content.map(match => match.entry.key)).toEqual([1])
    expect(result.content[0]!.hits.queries).toBeGreaterThan(1)
  })

  it('matches the method with the path, and the status', () => {
    expect(keys(searchEntries(entries, 'get /api/b').requests)).toEqual([1, 4])
    expect(keys(searchEntries(entries, '500').requests)).toEqual([4])
  })

  it('lists a request once, among the request matches, when its record matches too', () => {
    const result = searchEntries(entries, '/api/boom')
    expect(keys(result.requests)).toEqual([4])
    expect(result.content).toEqual([])
  })

  it('searches log messages, cache keys, exceptions and the controller', () => {
    expect(searchEntries(entries, 'warning message').content.map(match => match.entry.key)).toEqual([2])
    expect(searchEntries(entries, 'demo:top-books').content[0]).toMatchObject({ entry: { key: 3 }, hits: { cache: 2 } })
    expect(searchEntries(entries, 'RuntimeException').content[0]).toMatchObject({ entry: { key: 4 }, hits: { exceptions: 1 } })
    expect(searchEntries(entries, 'BookController').content[0]).toMatchObject({ entry: { key: 1 }, hits: { controller: true } })
  })

  it('does not search records that are not loaded', () => {
    expect(searchEntries([entry(1, '/x', { detailsState: 'idle' })], 'select').content).toEqual([])
  })
})

describe('describeHits', () => {
  it('names what matched, with counts', () => {
    expect(describeHits({ controller: true, queries: 3, logs: 1 })).toBe('controller · 3 queries · 1 log')
    expect(describeHits({ queries: 1, cache: 2, timeline: 1 })).toBe('1 query · 2 cache keys · 1 timeline event')
  })
})
