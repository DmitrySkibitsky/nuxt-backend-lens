// Normalized, vendor-neutral model. Nothing outside an adapter may depend on a vendor's record format.

/** One frame of a backend stack trace. */
export interface StackFrame {
  file: string
  line: number | null
  call?: string
  /** Frame inside a dependency (vendor/) rather than application code. */
  isVendor: boolean
}

export interface DebugQuery {
  sql: string
  /** Bindings when the server reports them separately; some servers inline them into `sql`. */
  bindings?: unknown[]
  durationMs: number
  connection?: string
  /** Epoch seconds, when known. */
  time?: number
  /** First application (non-vendor) frame — where the query came from. */
  callSite?: StackFrame
  trace: StackFrame[]
}

export interface DebugException {
  type: string
  message: string
  file?: string
  line?: number | null
}

export interface DebugLogEntry {
  level: string
  message: string
  context?: unknown
  /** Epoch seconds, when known. */
  time?: number
  exception?: DebugException
}

export type DebugCacheEventType = 'hit' | 'miss' | 'write' | 'delete' | 'other'

export interface DebugCacheEvent {
  type: DebugCacheEventType
  key: string
  durationMs?: number
}

export interface DebugTimelineEvent {
  label: string
  /** Offset from the request start. */
  startMs: number
  durationMs: number
}

/** Everything the UI can show about one backend request. */
export interface DebugDetails {
  id: string
  adapter: string
  method?: string
  uri?: string
  status?: number
  controller?: string
  /** Epoch seconds of the request start on the server, when known. */
  startedAt?: number
  durationMs?: number
  memoryBytes?: number
  queries: DebugQuery[]
  queriesDurationMs: number
  logs: DebugLogEntry[]
  cache: DebugCacheEvent[]
  timeline: DebugTimelineEvent[]
  exceptions: DebugException[]
}

/** Read access to response headers, uniform for fetch and XHR. */
export interface HeaderReader {
  get(name: string): string | null
}

/** A finished HTTP request seen by the interceptor. */
export interface CapturedResponse {
  /** Absolute URL. */
  url: string
  method: string
  status: number
  headers: HeaderReader
  /** performance.now() at request start / end. */
  startTime: number
  endTime: number
  initiator: 'fetch' | 'xhr'
}

/** Where a request's debug record lives, as detected by an adapter. */
export interface RecordRef {
  adapter: string
  id: string
  /** Absolute URL of the raw record. */
  url: string
  /** Optional link to the vendor's own UI. */
  webUrl?: string
  init?: RequestInit
}

/**
 * A data source. `detect` reads a response's headers and says where its record lives;
 * `parse` turns the raw record into the normalized model. Both are pure — fetching, retries and
 * caching belong to the core — so adapters are trivially testable against captured fixtures.
 */
export interface BackendLensAdapter {
  name: string
  detect(response: CapturedResponse): RecordRef | null
  parse(raw: unknown, ref: RecordRef): DebugDetails
}

export interface ServerTimingMetric {
  name: string
  durationMs: number
  description?: string
}

export type DetailsState = 'none' | 'idle' | 'loading' | 'loaded' | 'error'

/** A client-side navigation; requests started during it share its id. */
export interface NavigationEntry {
  id: number
  route: string
  startTime: number
}

/** One request in the panel. */
export interface RequestEntry {
  key: number
  method: string
  url: string
  /** pathname + search, for display. */
  path: string
  status: number
  startTime: number
  durationMs: number
  initiator: 'fetch' | 'xhr'
  navigationId: number
  ref?: RecordRef
  serverTiming: ServerTimingMetric[]
  detailsState: DetailsState
  details?: DebugDetails
  error?: string
}
