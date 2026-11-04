// Server-Timing fallback: for backends without Clockwork or Debugbar. The response header itself is
// the record (delivered inline, nothing to fetch), so the lens shows server time, database time and
// the reported metrics as a timeline, but no queries or logs.

import type { ServerTimingAdapterOptions } from '../options'
import { parseServerTimingHeader } from '../server-timing'
import type { BackendLensAdapter, DebugDetails, ServerTimingMetric } from '../types'

export const SERVER_TIMING_ADAPTER = 'server-timing'

let sequence = 0

export function createServerTimingAdapter(options: ServerTimingAdapterOptions): BackendLensAdapter {
  const databaseMetrics = new Set(options.databaseMetrics.map(name => name.toLowerCase()))
  const totalMetrics = options.totalMetrics.map(name => name.toLowerCase())

  return {
    name: SERVER_TIMING_ADAPTER,

    detect(response) {
      const header = response.headers.get(options.header)
      if (!header) {
        return null
      }
      const metrics = parseServerTimingHeader(header)
      if (!metrics.length) {
        return null
      }
      return {
        adapter: SERVER_TIMING_ADAPTER,
        // No server-side id exists; a local one keeps records distinct.
        id: `server-timing-${++sequence}`,
        url: response.url,
        inline: metrics,
      }
    },

    parse(raw, ref) {
      const metrics = (Array.isArray(raw) ? raw : []) as ServerTimingMetric[]
      const byName = (name: string) => metrics.find(metric => metric.name.toLowerCase() === name)
      const total = totalMetrics.map(byName).find(Boolean)
      const database = metrics.filter(metric => databaseMetrics.has(metric.name.toLowerCase()))

      return {
        id: ref.id,
        adapter: SERVER_TIMING_ADAPTER,
        durationMs: total?.durationMs,
        queries: [],
        queriesDurationMs: database.reduce((sum, metric) => sum + metric.durationMs, 0),
        logs: [],
        cache: [],
        timeline: metrics.map(metric => ({
          label: metric.description ? `${metric.description} (${metric.name})` : metric.name,
          startMs: 0,
          durationMs: metric.durationMs,
        })),
        exceptions: [],
        note: 'Timing only: this response carries Server-Timing metrics but no debug record, so there are no queries or logs.',
      } satisfies DebugDetails
    },
  }
}
