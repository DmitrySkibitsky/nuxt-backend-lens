import { describe, expect, it } from 'vitest'
import { createClockworkAdapter } from '../../src/runtime/core/adapters/clockwork'
import { createDebugbarAdapter } from '../../src/runtime/core/adapters/debugbar'
import { analyzeQueries, buildWaterfall, normalizeSql, summarizeNavigation } from '../../src/runtime/core/analysis'
import { defaultOptions } from '../../src/runtime/core/options'
import type { DebugDetails, DebugQuery, RequestEntry } from '../../src/runtime/core/types'
import { loadFixture } from './helpers'

const options = { nPlusOneThreshold: 3, slowQueryMs: 100 }
const adapters = {
  clockwork: createClockworkAdapter(defaultOptions.adapters.clockwork),
  debugbar: createDebugbarAdapter(defaultOptions.adapters.debugbar),
}

function details(source: 'clockwork' | 'debugbar', name: string): DebugDetails {
  const { response, record } = loadFixture(source, name)
  const adapter = adapters[source]
  return adapter.parse(record, adapter.detect(response)!)
}

const query = (sql: string, extra: Partial<DebugQuery> = {}): DebugQuery => ({ sql, durationMs: 1, trace: [], ...extra })
const site = (line: number) => ({ file: '/app/app/X.php', line, isVendor: false })

describe('normalizeSql', () => {
  it('replaces literals and parameters, keeps identifiers', () => {
    expect(normalizeSql('SELECT * FROM "authors" WHERE "authors"."id" = 20 LIMIT 1'))
      .toBe('select * from "authors" where "authors"."id" = ? limit ?')
    expect(normalizeSql('select * from `t1` where name = \'O\'\'Hara\' and x = $2'))
      .toBe('select * from `t1` where name = ? and x = ?')
    expect(normalizeSql('select * from books where id in (1, 2, 3)')).toBe('select * from books where id in (?)')
    expect(normalizeSql('select * from books where id in (?, ?)')).toBe('select * from books where id in (?)')
    expect(normalizeSql('select  -1.5,\n  col2   from t')).toBe('select ?, col2 from t')
  })
})

describe.each(['clockwork', 'debugbar'] as const)('analysis of real %s records', (source) => {
  it('finds the N+1 on /api/books and does not double-report its repeated ids as duplicates', () => {
    const analysis = analyzeQueries(details(source, 'books-n-plus-one').queries, options)
    expect(analysis.nPlusOne).toBe(1)
    expect(analysis.duplicates).toBe(0)
    const [issue] = analysis.issues
    expect(issue).toMatchObject({ kind: 'n+1', pattern: 'select * from "authors" where "authors"."id" = ? limit ?' })
    expect(issue!.indexes).toHaveLength(30)
    expect(issue!.kind === 'n+1' && issue!.callSite?.file).toMatch(/BookResource\.php$/)
  })

  it('reports nothing for the eager-loaded variant', () => {
    expect(analyzeQueries(details(source, 'books-eager').queries, options).issues).toEqual([])
  })

  it('finds the duplicated counts on /api/stats', () => {
    const analysis = analyzeQueries(details(source, 'stats-duplicates').queries, options)
    expect(analysis.nPlusOne).toBe(0)
    const duplicates = analysis.issues.filter(issue => issue.kind === 'duplicate')
    expect(duplicates.map(issue => [issue.sql.toLowerCase(), issue.indexes.length])).toEqual(expect.arrayContaining([
      ['select count(*) as "aggregate" from "books"', 3],
      ['select count(*) as "aggregate" from "authors"', 2],
    ]))
    expect(duplicates).toHaveLength(2)
  })

  it('flags the slow query', () => {
    const analysis = analyzeQueries(details(source, 'slow').queries, options)
    expect(analysis.issues.map(issue => issue.kind)).toEqual(['slow'])
  })
})

describe('analysis rules', () => {
  it('needs the threshold and a single call site for N+1', () => {
    const twice = [query('select * from a where id = 1', { callSite: site(1) }), query('select * from a where id = 2', { callSite: site(1) })]
    expect(analyzeQueries(twice, options).nPlusOne).toBe(0)
    const spread = [1, 2, 3].map(id => query(`select * from a where id = ${id}`, { callSite: site(id) }))
    expect(analyzeQueries(spread, options).nPlusOne).toBe(0)
    const loop = [1, 2, 3].map(id => query(`select * from a where id = ${id}`, { callSite: site(7) }))
    expect(analyzeQueries(loop, options).nPlusOne).toBe(1)
  })

  it('treats separate bindings as part of the statement identity', () => {
    const loop = [1, 2, 3].map(id => query('select * from a where id = ?', { bindings: [id], callSite: site(7) }))
    expect(analyzeQueries(loop, options)).toMatchObject({ nPlusOne: 1, duplicates: 0 })
    const same = [1, 1].map(id => query('select * from a where id = ?', { bindings: [id] }))
    expect(analyzeQueries(same, options)).toMatchObject({ nPlusOne: 0, duplicates: 1 })
  })

  it('reports identical statements from one call site as a duplicate, not N+1', () => {
    const repeated = [1, 2, 3].map(() => query('select * from settings', { callSite: site(3) }))
    expect(analyzeQueries(repeated, options)).toMatchObject({ nPlusOne: 0, duplicates: 1 })
  })
})

describe('summarizeNavigation', () => {
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

  it('totals loaded records, counts issues and repeated requests', () => {
    const summary = summarizeNavigation([
      entry(1, '/api/books', { details: details('clockwork', 'books-n-plus-one') }),
      entry(2, '/api/stats', { details: details('clockwork', 'stats-duplicates') }),
      entry(3, '/api/stats', { detailsState: 'loading' }),
      entry(4, '/api/boom', { status: 500, details: details('clockwork', 'boom') }),
    ], options)
    expect(summary).toMatchObject({ requests: 4, loaded: 3, queries: 31 + 6 + 1, nPlusOne: 1, duplicates: 2, errors: 1 })
    expect(summary.repeatedRequests).toEqual([{ method: 'GET', path: '/api/stats', count: 2 }])
    expect(summary.databaseMs).toBeGreaterThan(0)
  })
})

describe.each(['clockwork', 'debugbar'] as const)('waterfall of a real %s record', (source) => {
  it('places events and queries on one axis within the request duration', () => {
    const record = details(source, 'books-n-plus-one')
    const waterfall = buildWaterfall(record)
    const queryRows = waterfall.rows.filter(row => row.kind === 'query')
    expect(queryRows).toHaveLength(31)
    expect(waterfall.rows.some(row => row.kind === 'event')).toBe(true)
    for (const row of waterfall.rows) {
      expect(row.startMs).toBeGreaterThanOrEqual(0)
      // Server clocks are coarse; allow a small overshoot past the reported duration.
      expect(row.startMs + row.durationMs).toBeLessThanOrEqual(waterfall.totalMs + 1)
    }
    expect(waterfall.rows.map(row => row.startMs)).toEqual([...waterfall.rows.map(row => row.startMs)].sort((a, b) => a - b))
  })
})
