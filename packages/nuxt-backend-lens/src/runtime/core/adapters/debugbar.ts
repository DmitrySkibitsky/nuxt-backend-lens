// php-debugbar native format: `phpdebugbar-id` on the response, the record from the open handler
// (`{prefix}/open?op=get&id=…`). Works with Laravel Debugbar under Octane, unlike its Clockwork
// emulation.

import type { DebugbarAdapterOptions } from '../options'
import { asArray, asString, basePathFromPair, basePathFromVendor, findCallSite, isRecord, isVendorPath, toLine, toNumber } from '../trace'
import type {
  BackendLensAdapter,
  DebugCacheEvent,
  DebugCacheEventType,
  DebugDetails,
  DebugException,
  DebugLogEntry,
  DebugQuery,
  DebugTimelineEvent,
  SourceLocation,
  StackFrame,
} from '../types'
import { fillTemplate, joinPath, resolveOnServer } from '../url'

export const DEBUGBAR_ADAPTER = 'debugbar'

/** Cache measure labels are `"<event>\t<key>"`. */
const CACHE_TYPES = new Map<string, DebugCacheEventType>([
  ['hit', 'hit'],
  ['missed', 'miss'],
  ['written', 'write'],
  ['forgotten', 'delete'],
])

/** The route collector's `file`: `app/Http/Controllers/UserController.php:12-30`. */
const ROUTE_FILE = /^(.+?)(?::(\d+)(?:-\d+)?)?$/

/** Log collector messages are formatted as `[12:34:56] LOG.info: text {context}`. */
const LOG_PREFIX = /^\[\d{2}:\d{2}:\d{2}\] LOG\.\w+: /

export function createDebugbarAdapter(options: DebugbarAdapterOptions): BackendLensAdapter {
  const statementTypes = new Set(options.statementTypes)

  return {
    name: DEBUGBAR_ADAPTER,

    detect(response) {
      const id = response.headers.get(options.idHeader)
      if (!id) {
        return null
      }
      return {
        adapter: DEBUGBAR_ADAPTER,
        id,
        url: resolveOnServer(joinPath(options.prefix, fillTemplate(options.openPath, id)), response.url),
      }
    },

    parse(raw, ref) {
      const record = withoutKeys(isRecord(raw) ? raw : {}, options.ignoreKeys)
      const meta = isRecord(record.__meta) ? record.__meta : {}
      const request = isRecord(record.request) && isRecord(record.request.data) ? record.request.data : {}
      const time = isRecord(record.time) ? record.time : {}
      const queriesCollector = isRecord(record.queries) ? record.queries : {}
      const requestStart = toNumber(time.start)

      const queries = asArray(queriesCollector.statements)
        .filter(isRecord)
        .filter(statement => statementTypes.has(String(statement.type)))
        .map(parseStatement)

      const accumulated = toNumber(queriesCollector.accumulated_duration)
      const controllerSource = routeFileOf(request.file)

      return {
        id: asString(meta.id) ?? ref.id,
        adapter: DEBUGBAR_ADAPTER,
        method: asString(meta.method),
        uri: asString(meta.uri),
        status: toNumber(request.status_code),
        controller: controllerOf(request.controller),
        controllerSource,
        basePath: basePathOf(queriesCollector.statements, request.file, controllerSource),
        startedAt: requestStart ?? toNumber(meta.utime),
        durationMs: secondsToMs(time.duration),
        memoryBytes: isRecord(record.memory) ? toNumber(record.memory.peak_usage) : undefined,
        queries,
        queriesDurationMs: accumulated !== undefined
          ? accumulated * 1000
          : queries.reduce((total, query) => total + query.durationMs, 0),
        logs: collectMessages(record).map(parseMessage),
        cache: measuresOf(record.cache).map(parseCacheMeasure),
        timeline: measuresOf(record.time).map(measure => parseTimelineMeasure(measure, requestStart)),
        exceptions: isRecord(record.exceptions)
          ? asArray(record.exceptions.exceptions).filter(isRecord).map(parseException)
          : [],
      } satisfies DebugDetails
    },
  }
}

function withoutKeys(record: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  if (!keys.length) {
    return record
  }
  const ignored = new Set(keys)
  return Object.fromEntries(Object.entries(record).filter(([key]) => !ignored.has(key)))
}

function secondsToMs(value: unknown): number | undefined {
  const seconds = toNumber(value)
  return seconds === undefined ? undefined : seconds * 1000
}

function controllerOf(value: unknown): string | undefined {
  if (isRecord(value)) {
    return asString(value.value)
  }
  return asString(value)
}

function parseFrame(frame: Record<string, unknown>): StackFrame {
  const file = asString(frame.file) ?? asString(frame.name) ?? ''
  return {
    file,
    line: toLine(frame.line),
    call: asString(frame.namespace) ?? undefined,
    isVendor: file === '' || isVendorPath(file),
  }
}

function parseStatement(statement: Record<string, unknown>): DebugQuery {
  const trace = asArray(statement.backtrace).filter(isRecord).map(parseFrame)
  // `source` is Debugbar's own pick of the application frame; fall back to the first non-vendor one.
  const source = isRecord(statement.source) ? parseFrame(statement.source) : undefined
  const params = asArray(statement.params)
  return {
    sql: String(statement.sql ?? ''),
    bindings: params.length ? params : undefined,
    durationMs: secondsToMs(statement.duration) ?? 0,
    connection: asString(statement.connection),
    time: toNumber(statement.start),
    trace,
    callSite: source && !source.isVendor ? source : findCallSite(trace),
  }
}

function collectMessages(record: Record<string, unknown>): Record<string, unknown>[] {
  return ['messages', 'logs'].flatMap((key) => {
    const collector = record[key]
    return isRecord(collector) ? asArray(collector.messages).filter(isRecord) : []
  })
}

function parseMessage(message: Record<string, unknown>): DebugLogEntry {
  const context = isRecord(message.context_json) && Object.keys(message.context_json).length
    ? message.context_json
    : undefined
  return {
    level: asString(message.label) ?? 'info',
    message: cleanMessage(String(message.message ?? ''), context !== undefined),
    context,
    time: toNumber(message.time),
    callSite: frameOf(xdebugLinkOf(message.xdebug_link)),
  }
}

function frameOf(location: SourceLocation | undefined): StackFrame | undefined {
  return location ? { ...location, isVendor: isVendorPath(location.file) } : undefined
}

/** Drops the `[time] LOG.level: ` prefix and the pretty-printed context the log collector appends. */
function cleanMessage(text: string, hasContext: boolean): string {
  const withoutPrefix = text.replace(LOG_PREFIX, '')
  if (!hasContext) {
    return withoutPrefix
  }
  for (let index = withoutPrefix.indexOf(' {'); index !== -1; index = withoutPrefix.indexOf(' {', index + 1)) {
    try {
      JSON.parse(withoutPrefix.slice(index + 1))
      return withoutPrefix.slice(0, index)
    }
    catch {
      // not the trailing context yet
    }
  }
  return withoutPrefix
}

function measuresOf(collector: unknown): Record<string, unknown>[] {
  return isRecord(collector) ? asArray(collector.measures).filter(isRecord) : []
}

function parseCacheMeasure(measure: Record<string, unknown>): DebugCacheEvent {
  const label = String(measure.label ?? '')
  const [event = '', ...keyParts] = label.split('\t')
  const params = isRecord(measure.params) ? measure.params : {}
  return {
    type: CACHE_TYPES.get(event) ?? 'other',
    key: asString(params.key) ?? keyParts.join('\t'),
    durationMs: secondsToMs(measure.duration),
  }
}

function parseTimelineMeasure(measure: Record<string, unknown>, requestStart: number | undefined): DebugTimelineEvent {
  const relative = toNumber(measure.relative_start)
  const start = toNumber(measure.start)
  const startSeconds = relative ?? (start !== undefined && requestStart !== undefined ? start - requestStart : 0)
  return {
    label: asString(measure.label) ?? '',
    startMs: startSeconds * 1000,
    durationMs: secondsToMs(measure.duration) ?? 0,
  }
}

function parseException(exception: Record<string, unknown>): DebugException {
  return {
    type: asString(exception.type) ?? 'Exception',
    message: asString(exception.message) ?? '',
    file: asString(exception.file),
    line: toLine(exception.line),
  }
}

/** The controller's file and action line, relative to the project root. */
function routeFileOf(value: unknown): SourceLocation | undefined {
  const text = isRecord(value) ? asString(value.value) : asString(value)
  const match = text ? ROUTE_FILE.exec(text.trim()) : null
  return match ? { file: match[1]!, line: toLine(match[2]) } : undefined
}

/**
 * The project root: backtrace frames carry the absolute `file` and the root-relative `name`, the
 * route's editor link the absolute path of its root-relative `file`. Vendor paths are the fallback.
 */
function basePathOf(statements: unknown, routeFile: unknown, controllerSource: SourceLocation | undefined): string | undefined {
  const frames = asArray(statements).filter(isRecord).flatMap(statement => asArray(statement.backtrace)).filter(isRecord)
  const pairs = frames.map(frame => [asString(frame.file), asString(frame.name)] as const)
  if (isRecord(routeFile) && controllerSource) {
    pairs.push([xdebugLinkOf(routeFile.xdebug_link)?.file, controllerSource.file])
  }
  for (const [absolute, relative] of pairs) {
    const root = absolute && relative ? basePathFromPair(absolute, relative) : undefined
    if (root) {
      return root
    }
  }
  return basePathFromVendor(frames.flatMap(frame => asString(frame.file) ?? []))
}

/**
 * php-debugbar's editor link (`xdebug_link.url`), built from its `editor` setting: either a
 * `?file=…&line=…` query (PhpStorm, Sublime…) or a `scheme://file/<path>:<line>` path (VS Code, Zed…).
 */
function xdebugLinkOf(value: unknown): SourceLocation | undefined {
  const url = isRecord(value) ? asString(value.url) : undefined
  if (!url) {
    return undefined
  }
  const line = isRecord(value) ? toLine(value.line) : null
  try {
    const file = new URL(url).searchParams.get('file')
    if (file) {
      return { file, line: line ?? toLine(new URL(url).searchParams.get('line')) }
    }
  }
  catch {
    return undefined
  }
  const match = /^[\w+.-]+:\/\/file\/?(.+?)(?::(\d+))?(?::\d+)?$/.exec(url)
  if (!match) {
    return undefined
  }
  const file = decodeURIComponent(match[1]!)
  return { file: file.startsWith('/') || /^[A-Z]:/i.test(file) ? file : `/${file}`, line: line ?? toLine(match[2]) }
}
