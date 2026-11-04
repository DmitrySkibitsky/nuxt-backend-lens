// Module options. They travel to the browser through runtimeConfig.public.backendLens, so they must
// stay JSON-serializable. Every vendor-specific string (header names, paths) is an option with a default.

export interface ClockworkAdapterOptions {
  enabled: boolean
  /** Response header carrying the record id. */
  idHeader: string
  /** Response header with the record directory; absolute or relative to the server root. */
  pathHeader: string
  /** Record directory when the response carries no path header. */
  endpoint: string
  /** Link to Clockwork's web UI; `{id}` is replaced with the record id. `false` hides the link. */
  webUi: string | false
  /**
   * Statements that are not queries of the request and are dropped. Debugbar's Clockwork emulation
   * reports the DB connect as `Connection Established`.
   */
  ignoreStatements: string[]
}

export interface DebugbarAdapterOptions {
  enabled: boolean
  /** Response header carrying the php-debugbar request id. */
  idHeader: string
  /** Debugbar route prefix (`debugbar.route_prefix`). */
  prefix: string
  /** Open-handler path under the prefix; `{id}` is replaced with the (URL-encoded) id. */
  openPath: string
  /**
   * Record keys to drop before parsing. `clockwork` holds the Clockwork emulation's collector,
   * which carries another request's data under Octane (fruitcake/laravel-debugbar 4.4.5).
   */
  ignoreKeys: string[]
  /**
   * Statement types kept as queries. Debugbar also records connection and transaction events
   * (`type: "transaction"`, e.g. `Connection Established`).
   */
  statementTypes: string[]
}

export type ToolbarPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

export interface ToolbarOptions {
  enabled: boolean
  position: ToolbarPosition
  /** Open the panel on load. */
  open: boolean
}

export interface BackendLensOptions {
  /** Master switch. Prefer adding the module under `$development` so it never reaches production. */
  enabled: boolean
  /**
   * Requests to list even without debug data (status and duration only). Glob patterns over the
   * path (`/api/**`) or the full URL (`https://api.example.com/**`). Requests detected by an
   * adapter are always listed.
   */
  include: string[]
  /** Requests never listed, even with debug data. Same syntax as `include`. */
  exclude: string[]
  /** Adapter priority: when several detect the same response, the first one wins. */
  adapterOrder: string[]
  adapters: {
    clockwork: ClockworkAdapterOptions
    debugbar: DebugbarAdapterOptions
  }
  toolbar: ToolbarOptions
  /** Requests kept in memory, oldest dropped first. */
  maxRequests: number
  /** Load records in the background so the list can show query counts without opening each one. */
  prefetch: {
    enabled: boolean
    concurrency: number
  }
  /** Backoff between record fetch attempts: the server may persist a record after responding. */
  retryDelays: number[]
  /** Queries at or above this duration are highlighted. */
  slowQueryMs: number
}

export const defaultOptions: BackendLensOptions = {
  enabled: true,
  include: [],
  exclude: [],
  adapterOrder: ['debugbar', 'clockwork'],
  adapters: {
    clockwork: {
      enabled: true,
      idHeader: 'x-clockwork-id',
      pathHeader: 'x-clockwork-path',
      endpoint: '/__clockwork/',
      webUi: '/clockwork/app',
      ignoreStatements: ['Connection Established'],
    },
    debugbar: {
      enabled: true,
      idHeader: 'phpdebugbar-id',
      prefix: '/_debugbar',
      openPath: 'open?op=get&id={id}',
      ignoreKeys: ['clockwork'],
      statementTypes: ['query'],
    },
  },
  toolbar: {
    enabled: true,
    position: 'bottom-right',
    open: false,
  },
  maxRequests: 200,
  prefetch: {
    enabled: true,
    concurrency: 2,
  },
  retryDelays: [0, 100, 300, 1000],
  slowQueryMs: 100,
}
