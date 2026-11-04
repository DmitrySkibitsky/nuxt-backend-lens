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
