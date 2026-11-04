// Clockwork protocol: `X-Clockwork-Id` (+ optional `X-Clockwork-Path`) on the response, a JSON record
// per id. Served by Clockwork itself and by Laravel Debugbar's Clockwork emulation.

import type { ClockworkAdapterOptions } from '../options'
import { asArray, asString, findCallSite, isRecord, isVendorPath, toLine, toNumber } from '../trace'
import type {
  BackendLensAdapter,
  DebugCacheEvent,
  DebugCacheEventType,
  DebugDetails,
  DebugException,
  DebugLogEntry,
  DebugQuery,
  DebugTimelineEvent,
  StackFrame,
} from '../types'
import { fillTemplate, joinPath, resolveOnServer } from '../url'

export const CLOCKWORK_ADAPTER = 'clockwork'

const CACHE_TYPES: Record<string, DebugCacheEventType> = {
  hit: 'hit',
  miss: 'miss',
  write: 'write',
  delete: 'delete',
}

export function createClockworkAdapter(options: ClockworkAdapterOptions): BackendLensAdapter {
  const ignoredStatements = new Set(options.ignoreStatements)

  return {
    name: CLOCKWORK_ADAPTER,

    detect(response) {
      const id = response.headers.get(options.idHeader)
      if (!id) {
        return null
      }
      const directory = response.headers.get(options.pathHeader) || options.endpoint
      return {
        adapter: CLOCKWORK_ADAPTER,
        id,
        url: resolveOnServer(joinPath(directory, encodeURIComponent(id)), response.url),
        webUrl: options.webUi ? resolveOnServer(fillTemplate(options.webUi, id), response.url) : undefined,
      }
    },

    parse(raw, ref) {
      const record = isRecord(raw) ? raw : {}
      const requestStart = toNumber(record.time)

      const queries = asArray(record.databaseQueries)
        .filter(isRecord)
        .filter(query => !ignoredStatements.has(String(query.query)))
        .map(parseQuery)

      const logs = asArray(record.log).filter(isRecord).map(parseLogEntry)

      return {
        id: asString(record.id) ?? ref.id,
        adapter: CLOCKWORK_ADAPTER,
        method: asString(record.method),
        uri: asString(record.uri),
        status: toNumber(record.responseStatus),
        controller: asString(record.controller),
        startedAt: requestStart,
        durationMs: toNumber(record.responseDuration),
        memoryBytes: toNumber(record.memoryUsage),
        queries,
        queriesDurationMs: toNumber(record.databaseDuration) ?? sum(queries.map(query => query.durationMs)),
        logs,
        cache: asArray(record.cacheQueries).filter(isRecord).map(parseCacheEvent),
        timeline: asArray(record.timelineData).filter(isRecord).map(event => parseTimelineEvent(event, requestStart)),
        exceptions: logs.flatMap(entry => (entry.exception ? [entry.exception] : [])),
      } satisfies DebugDetails
    },
  }
}

function parseTrace(value: unknown): StackFrame[] {
  return asArray(value).filter(isRecord).map((frame) => {
    const file = asString(frame.file) ?? ''
    return {
      file,
      line: toLine(frame.line),
      call: asString(frame.call),
      isVendor: typeof frame.isVendor === 'boolean' ? frame.isVendor || file === '' : isVendorPath(file),
    }
  })
}

function parseQuery(query: Record<string, unknown>): DebugQuery {
  const trace = parseTrace(query.trace)
  const bindings = Array.isArray(query.bindings) && query.bindings.length ? query.bindings : undefined
  return {
    sql: String(query.query ?? ''),
    bindings,
    durationMs: toNumber(query.duration) ?? 0,
    connection: asString(query.connection),
    time: toNumber(query.time),
    trace,
    callSite: findCallSite(trace),
  }
}

function parseException(value: unknown): DebugException | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  return {
    type: asString(value.type) ?? 'Exception',
    message: asString(value.message) ?? '',
    file: asString(value.file),
    line: toLine(value.line),
  }
}

function parseLogEntry(entry: Record<string, unknown>): DebugLogEntry {
  return {
    level: asString(entry.level) ?? 'info',
    message: String(entry.message ?? ''),
    context: stripTypeMarkers(entry.context),
    time: toNumber(entry.time),
    exception: parseException(entry.exception),
  }
}

/** Clockwork serializes values with `__type__` markers; they are noise for display. */
function stripTypeMarkers(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripTypeMarkers)
  }
  if (!isRecord(value)) {
    return value
  }
  const entries = Object.entries(value).filter(([key]) => key !== '__type__')
  if (!entries.length) {
    return undefined
  }
  return Object.fromEntries(entries.map(([key, item]) => [key, stripTypeMarkers(item)]))
}

function parseCacheEvent(event: Record<string, unknown>): DebugCacheEvent {
  return {
    type: CACHE_TYPES[String(event.type)] ?? 'other',
    key: String(event.key ?? ''),
    durationMs: toNumber(event.duration),
  }
}

function parseTimelineEvent(event: Record<string, unknown>, requestStart: number | undefined): DebugTimelineEvent {
  const start = toNumber(event.start)
  return {
    label: asString(event.description) ?? '',
    startMs: start !== undefined && requestStart !== undefined ? (start - requestStart) * 1000 : 0,
    durationMs: toNumber(event.duration) ?? 0,
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}
