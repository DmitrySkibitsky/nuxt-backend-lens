// Server-Timing comes from resource timing entries. They must be taken from a PerformanceObserver:
// in `nuxt dev` Vite loads hundreds of modules, the resource timing buffer (250 entries by default)
// fills up and later entries never reach performance.getEntriesByType(). Entries also arrive
// asynchronously — usually after fetch() has resolved — so they are matched to requests by URL and
// start time.

import type { ServerTimingMetric } from './types'

export interface ServerTimingEntry {
  url: string
  startTime: number
  metrics: ServerTimingMetric[]
}

interface ResourceEntryLike {
  name: string
  startTime: number
  initiatorType: string
  serverTiming?: ReadonlyArray<{ name: string, duration: number, description: string }>
}

const NETWORK_INITIATORS = new Set(['fetch', 'xmlhttprequest'])

export function toServerTimingEntry(entry: ResourceEntryLike): ServerTimingEntry | null {
  if (!NETWORK_INITIATORS.has(entry.initiatorType) || !entry.serverTiming?.length) {
    return null
  }
  return {
    url: entry.name,
    startTime: entry.startTime,
    metrics: entry.serverTiming.map(metric => ({
      name: metric.name,
      durationMs: metric.duration,
      description: metric.description || undefined,
    })),
  }
}

/** Starts observing; returns a stop function. A no-op where PerformanceObserver is unavailable. */
export function observeServerTiming(onEntry: (entry: ServerTimingEntry) => void): () => void {
  if (typeof PerformanceObserver === 'undefined') {
    return () => {}
  }
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as unknown as ResourceEntryLike[]) {
      const timing = toServerTimingEntry(entry)
      if (timing) {
        onEntry(timing)
      }
    }
  })
  try {
    observer.observe({ type: 'resource' })
  }
  catch {
    return () => {}
  }
  return () => observer.disconnect()
}

/** The metric servers use for total database time (Clockwork: `db`). */
export function databaseTimeMs(metrics: readonly ServerTimingMetric[], names: readonly string[] = ['db']): number | undefined {
  return metrics.find(metric => names.includes(metric.name))?.durationMs
}

/**
 * Parses a `Server-Timing` header value (W3C Server Timing, `metric *( OWS ";" OWS param )`).
 * Quoted descriptions may contain commas and semicolons; unknown params are ignored.
 */
export function parseServerTimingHeader(value: string): ServerTimingMetric[] {
  const metrics: ServerTimingMetric[] = []
  let index = 0

  const skipSpaces = () => {
    while (index < value.length && /\s/.test(value[index]!)) {
      index++
    }
  }
  const readToken = () => {
    const start = index
    while (index < value.length && !/[\s,;=]/.test(value[index]!)) {
      index++
    }
    return value.slice(start, index)
  }
  const readValue = () => {
    if (value[index] !== '"') {
      return readToken()
    }
    index++
    let result = ''
    while (index < value.length && value[index] !== '"') {
      if (value[index] === '\\' && index + 1 < value.length) {
        index++
      }
      result += value[index]
      index++
    }
    index++ // closing quote
    return result
  }

  while (index < value.length) {
    skipSpaces()
    const name = readToken()
    let durationMs = 0
    let description: string | undefined
    skipSpaces()
    while (value[index] === ';') {
      index++
      skipSpaces()
      const param = readToken().toLowerCase()
      skipSpaces()
      let paramValue = ''
      if (value[index] === '=') {
        index++
        skipSpaces()
        paramValue = readValue()
      }
      if (param === 'dur' && Number.isFinite(Number(paramValue))) {
        durationMs = Number(paramValue)
      }
      else if (param === 'desc') {
        description = paramValue
      }
      skipSpaces()
    }
    if (name) {
      metrics.push({ name, durationMs, description })
    }
    // Skip anything malformed up to the next metric.
    while (index < value.length && value[index] !== ',') {
      index++
    }
    index++
  }
  return metrics
}
