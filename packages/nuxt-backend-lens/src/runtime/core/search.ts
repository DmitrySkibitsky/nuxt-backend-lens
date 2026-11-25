import type { DebugDetails, RequestEntry } from './types'

/** What inside a request's record matched, by kind; only kinds with matches are present. */
export interface ContentHits {
  queries?: number
  logs?: number
  cache?: number
  exceptions?: number
  timeline?: number
  controller?: boolean
}

export interface SearchResult {
  /** Requests whose method, path or status match, in their original order. */
  requests: RequestEntry[]
  /** Requests that match only inside their loaded record, in their original order. */
  content: { entry: RequestEntry, hits: ContentHits }[]
}

/**
 * Case-insensitive substring search. A request matching by itself is listed once, among the
 * request matches, even when its record matches too. Records not loaded yet are not searched.
 */
export function searchEntries(entries: readonly RequestEntry[], query: string): SearchResult {
  const needle = query.trim().toLowerCase()
  const result: SearchResult = { requests: [], content: [] }
  if (!needle) {
    result.requests = [...entries]
    return result
  }
  const has = (text: string | undefined) => text !== undefined && text.toLowerCase().includes(needle)
  for (const entry of entries) {
    if (has(`${entry.method} ${entry.path}`) || has(String(entry.status))) {
      result.requests.push(entry)
      continue
    }
    const hits = entry.details && searchDetails(entry.details, has)
    if (hits) {
      result.content.push({ entry, hits })
    }
  }
  return result
}

function searchDetails(details: DebugDetails, has: (text: string | undefined) => boolean): ContentHits | undefined {
  const count = <T>(items: readonly T[], text: (item: T) => (string | undefined)[]) =>
    items.filter(item => text(item).some(has)).length || undefined
  const hits: ContentHits = {
    queries: count(details.queries, query => [query.sql, ...(query.bindings ?? []).map(binding => String(binding))]),
    logs: count(details.logs, log => [log.message, log.exception?.type, log.exception?.message]),
    cache: count(details.cache, event => [event.key]),
    exceptions: count(details.exceptions, exception => [exception.type, exception.message]),
    timeline: count(details.timeline, event => [event.label]),
    controller: has(details.controller) || undefined,
  }
  return Object.values(hits).some(Boolean) ? hits : undefined
}

/** "3 queries · 1 log": what matched, for the request list. */
export function describeHits(hits: ContentHits): string {
  const count = (n: number | undefined, one: string, many: string) => n && `${n} ${n === 1 ? one : many}`
  return [
    hits.controller && 'controller',
    count(hits.queries, 'query', 'queries'),
    count(hits.logs, 'log', 'logs'),
    count(hits.cache, 'cache key', 'cache keys'),
    count(hits.exceptions, 'exception', 'exceptions'),
    count(hits.timeline, 'timeline event', 'timeline events'),
  ].filter(Boolean).join(' · ')
}
