// Query and request analysis over the normalized model, so it works the same for every adapter.

import type { DebugDetails, DebugQuery, RequestEntry, StackFrame } from './types'

export interface AnalysisOptions {
  /** Same statement shape from the same call site this many times is reported as N+1. */
  nPlusOneThreshold: number
  slowQueryMs: number
}

export type QueryIssue
  = | {
    kind: 'n+1'
    /** Statement with literals replaced by `?`. */
    pattern: string
    callSite?: StackFrame
    /** Indexes into `DebugDetails.queries`. */
    indexes: number[]
    totalMs: number
  }
  | {
    kind: 'duplicate'
    sql: string
    indexes: number[]
    totalMs: number
  }
  | {
    kind: 'slow'
    sql: string
    indexes: [number]
    totalMs: number
  }

export interface RequestAnalysis {
  issues: QueryIssue[]
  nPlusOne: number
  duplicates: number
  slow: number
}

export interface NavigationSummary {
  requests: number
  /** Requests whose record is loaded; query totals only cover those. */
  loaded: number
  queries: number
  databaseMs: number
  nPlusOne: number
  duplicates: number
  slow: number
  errors: number
  /** Same method + URL requested more than once in the navigation. */
  repeatedRequests: { method: string, path: string, count: number }[]
}

const STRING_LITERAL = /'(?:[^'\\]|\\.|'')*'/g
const NUMBER_LITERAL = /(?<![\w$."`])-?\d+(?:\.\d+)?(?![\w"`])/g
const POSITIONAL_PARAMETER = /\$\d+/g
const VALUE_LIST = /\(\s*\?(?:\s*,\s*\?)*\s*\)/g
const WHITESPACE = /\s+/g

/**
 * The shape of a statement: literals and parameters become `?`, `IN (?, ?, ?)` becomes `IN (?)`,
 * whitespace and case are normalized. Quoted identifiers ("authors", `authors`) are kept.
 */
export function normalizeSql(sql: string): string {
  return sql
    .replace(STRING_LITERAL, '?')
    .replace(POSITIONAL_PARAMETER, '?')
    .replace(NUMBER_LITERAL, '?')
    .replace(VALUE_LIST, '(?)')
    .replace(WHITESPACE, ' ')
    .trim()
    .toLowerCase()
}

/** Exact identity of an executed statement: text plus bindings (servers may keep them apart). */
function exactKey(query: DebugQuery): string {
  const text = query.sql.replace(WHITESPACE, ' ').trim().toLowerCase()
  return query.bindings?.length ? `${text}\u0000${JSON.stringify(query.bindings)}` : text
}

function callSiteKey(frame: StackFrame | undefined): string {
  return frame ? `${frame.file}:${frame.line ?? ''}` : ''
}

function groupBy<T>(items: readonly T[], key: (item: T, index: number) => string): Map<string, number[]> {
  const groups = new Map<string, number[]>()
  items.forEach((item, index) => {
    const name = key(item, index)
    const group = groups.get(name)
    if (group) {
      group.push(index)
    }
    else {
      groups.set(name, [index])
    }
  })
  return groups
}

const sumMs = (queries: readonly DebugQuery[], indexes: readonly number[]) =>
  indexes.reduce((total, index) => total + (queries[index]?.durationMs ?? 0), 0)

export function analyzeQueries(queries: readonly DebugQuery[], options: AnalysisOptions): RequestAnalysis {
  const issues: QueryIssue[] = []
  const coveredByNPlusOne = new Set<number>()

  // N+1: one call site issuing the same statement shape with different values, again and again.
  const shapes = groupBy(queries, query => `${callSiteKey(query.callSite)}\u0000${normalizeSql(query.sql)}`)
  for (const indexes of shapes.values()) {
    if (indexes.length < options.nPlusOneThreshold) {
      continue
    }
    const distinct = new Set(indexes.map(index => exactKey(queries[index]!)))
    if (distinct.size < 2) {
      continue // all identical: that is a duplicate, reported below
    }
    const first = queries[indexes[0]!]!
    issues.push({ kind: 'n+1', pattern: normalizeSql(first.sql), callSite: first.callSite, indexes, totalMs: sumMs(queries, indexes) })
    indexes.forEach(index => coveredByNPlusOne.add(index))
  }

  // Duplicates: byte-identical statements (any call site), unless already explained by an N+1.
  const exact = groupBy(queries, exactKey)
  for (const indexes of exact.values()) {
    const remaining = indexes.filter(index => !coveredByNPlusOne.has(index))
    if (remaining.length > 1) {
      issues.push({ kind: 'duplicate', sql: queries[remaining[0]!]!.sql, indexes: remaining, totalMs: sumMs(queries, remaining) })
    }
  }

  queries.forEach((query, index) => {
    if (query.durationMs >= options.slowQueryMs) {
      issues.push({ kind: 'slow', sql: query.sql, indexes: [index], totalMs: query.durationMs })
    }
  })

  const order: Record<QueryIssue['kind'], number> = { 'n+1': 0, 'duplicate': 1, 'slow': 2 }
  issues.sort((a, b) => order[a.kind] - order[b.kind] || b.totalMs - a.totalMs)

  return {
    issues,
    nPlusOne: issues.filter(issue => issue.kind === 'n+1').length,
    duplicates: issues.filter(issue => issue.kind === 'duplicate').length,
    slow: issues.filter(issue => issue.kind === 'slow').length,
  }
}

const analysisCache = new WeakMap<DebugDetails, RequestAnalysis>()

/** Memoized per details object (details are immutable once loaded). */
export function analyzeDetails(details: DebugDetails, options: AnalysisOptions): RequestAnalysis {
  const cached = analysisCache.get(details)
  if (cached) {
    return cached
  }
  const analysis = analyzeQueries(details.queries, options)
  analysisCache.set(details, analysis)
  return analysis
}

export function summarizeNavigation(entries: readonly RequestEntry[], options: AnalysisOptions): NavigationSummary {
  const summary: NavigationSummary = {
    requests: entries.length,
    loaded: 0,
    queries: 0,
    databaseMs: 0,
    nPlusOne: 0,
    duplicates: 0,
    slow: 0,
    errors: 0,
    repeatedRequests: [],
  }

  for (const entry of entries) {
    if (entry.status >= 500 || entry.details?.exceptions.length) {
      summary.errors++
    }
    if (!entry.details) {
      continue
    }
    const analysis = analyzeDetails(entry.details, options)
    summary.loaded++
    summary.queries += entry.details.queries.length
    summary.databaseMs += entry.details.queriesDurationMs
    summary.nPlusOne += analysis.nPlusOne
    summary.duplicates += analysis.duplicates
    summary.slow += analysis.slow
  }

  const requests = groupBy(entries, entry => `${entry.method} ${entry.path}`)
  for (const indexes of requests.values()) {
    if (indexes.length > 1) {
      const entry = entries[indexes[0]!]!
      summary.repeatedRequests.push({ method: entry.method, path: entry.path, count: indexes.length })
    }
  }

  return summary
}

export interface WaterfallRow {
  kind: 'event' | 'query'
  label: string
  startMs: number
  durationMs: number
  /** Index into `DebugDetails.queries` for query rows. */
  queryIndex?: number
}

export interface Waterfall {
  totalMs: number
  rows: WaterfallRow[]
}

/**
 * Timeline events and queries on one time axis relative to the request start. Queries without a
 * timestamp (or without a known request start) are left out of the axis.
 */
export function buildWaterfall(details: DebugDetails): Waterfall {
  const rows: WaterfallRow[] = details.timeline.map(event => ({
    kind: 'event',
    label: event.label,
    startMs: Math.max(0, event.startMs),
    durationMs: event.durationMs,
  }))

  if (details.startedAt !== undefined) {
    details.queries.forEach((query, index) => {
      if (query.time === undefined) {
        return
      }
      rows.push({
        kind: 'query',
        label: query.sql,
        startMs: Math.max(0, (query.time - details.startedAt!) * 1000),
        durationMs: query.durationMs,
        queryIndex: index,
      })
    })
  }

  rows.sort((a, b) => a.startMs - b.startMs || (a.kind === b.kind ? 0 : a.kind === 'event' ? -1 : 1))
  const end = rows.reduce((max, row) => Math.max(max, row.startMs + row.durationMs), 0)
  return { totalMs: Math.max(details.durationMs ?? 0, end), rows }
}
