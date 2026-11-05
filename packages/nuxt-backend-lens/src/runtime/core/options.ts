// Module options. They travel to the browser through runtimeConfig.public.backendLens, so they must
// stay JSON-serializable. Every vendor-specific string (header names, paths) is an option with a default.

import { createDefu } from 'defu'

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

export interface ServerTimingAdapterOptions {
  /**
   * Fallback for backends without a debug package (Rails, Django, Go, Node…): a response whose
   * Server-Timing header is readable becomes a timing-only record. Last in the default order, so
   * Clockwork / Debugbar win when present.
   */
  enabled: boolean
  /** Response header to read. Cross-origin it must be listed in Access-Control-Expose-Headers. */
  header: string
  /** Metric names summed as database time. */
  databaseMetrics: string[]
  /** Metric names taken as the total server time (first match wins). */
  totalMetrics: string[]
}

export type ToolbarPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

/** Classes on `<html>` that mark the page's colour mode. */
export interface ColorModeClasses {
  dark: string
  light: string
}

export interface ToolbarOptions {
  enabled: boolean
  position: ToolbarPosition
  /** Open the panel on load. */
  open: boolean
  /**
   * The app's colour-mode classes on `<html>`, which the toolbar follows; without either it follows
   * the system. @nuxtjs/color-mode with `classSuffix: '-mode'` sets `dark-mode` / `light-mode`.
   */
  colorModeClasses: ColorModeClasses
}

export interface DevtoolsTabOptions {
  /** Add a "Backend Lens" tab to Nuxt DevTools (`nuxt dev` only). */
  enabled: boolean
  /** Dev-server route of the tab's page. */
  route: string
  /** Any Iconify icon name. */
  icon: string
}

export interface SqlDisplayOptions {
  /** Colour SQL keywords, strings, numbers and identifiers. */
  highlight: boolean
  /**
   * Lay SQL out over several lines (sql-formatter, loaded on demand). Off by default: one-line SQL is
   * denser and some statements may not parse.
   */
  format: boolean
  /** sql-formatter language: sql, postgresql, mysql, mariadb, sqlite, tsql, … */
  dialect: string
}

export interface VueDevtoolsOptions {
  /** Add a "Backend requests" layer to the Vue DevTools timeline (`nuxt dev` only). */
  enabled: boolean
  /** Layer color, 0xRRGGBB. */
  color: number
}

export interface ActionTrackingOptions {
  /** Attribute requests to the user action (click, submit…) that triggered them. */
  enabled: boolean
  /** DOM events treated as actions. */
  events: string[]
  /** A request belongs to the latest action at most this long before it started. */
  windowMs: number
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
    serverTiming: ServerTimingAdapterOptions
  }
  toolbar: ToolbarOptions
  devtools: DevtoolsTabOptions
  vueDevtools: VueDevtoolsOptions
  actions: ActionTrackingOptions
  /** Requests kept in memory, oldest dropped first. */
  maxRequests: number
  /** Load records in the background so the list can show query counts without opening each one. */
  prefetch: {
    enabled: boolean
    concurrency: number
  }
  /** Backoff between record fetch attempts: the server may persist a record after responding. */
  retryDelays: number[]
  /** A record fetch is abandoned after this many milliseconds, so a hung endpoint frees its slot. */
  recordTimeoutMs: number
  /** Queries at or above this duration are highlighted. */
  slowQueryMs: number
  sql: SqlDisplayOptions
  /** The same statement shape from one call site this many times (with different values) is N+1. */
  nPlusOneThreshold: number
}

export const defaultOptions: BackendLensOptions = {
  enabled: true,
  include: [],
  exclude: [],
  adapterOrder: ['debugbar', 'clockwork', 'server-timing'],
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
    serverTiming: {
      enabled: true,
      header: 'server-timing',
      databaseMetrics: ['db', 'database', 'sql'],
      totalMetrics: ['total', 'app'],
    },
  },
  toolbar: {
    enabled: true,
    position: 'bottom-right',
    open: false,
    colorModeClasses: { dark: 'dark', light: 'light' },
  },
  devtools: {
    enabled: true,
    route: '/__backend-lens/',
    icon: 'carbon:data-base',
  },
  vueDevtools: {
    enabled: true,
    color: 0x2563EB,
  },
  actions: {
    enabled: true,
    events: ['click', 'submit', 'change'],
    windowMs: 1000,
  },
  maxRequests: 200,
  prefetch: {
    enabled: true,
    concurrency: 2,
  },
  retryDelays: [0, 100, 300, 1000],
  recordTimeoutMs: 10_000,
  slowQueryMs: 100,
  sql: {
    highlight: true,
    format: false,
    dialect: 'sql',
  },
  nPlusOneThreshold: 3,
}

type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

export type ModuleOptions = DeepPartial<BackendLensOptions>

/** Like defu, but arrays from the user replace the defaults instead of being concatenated. */
export const mergeOptions = createDefu((target, key, value) => {
  if (Array.isArray(value)) {
    ;(target as Record<PropertyKey, unknown>)[key] = value
    return true
  }
  return false
})

/**
 * Full options from a partial input. Used by the module at build time and again in the browser:
 * runtime config may be partial (NUXT_PUBLIC_BACKEND_LENS_* overrides, or a dev server started with
 * an older module version), and missing keys must fall back to defaults instead of crashing.
 * Invalid values fall back too, with a warning: an env variable is a string unless it parses.
 */
export function resolveOptions(input: ModuleOptions | undefined): BackendLensOptions {
  return conform(mergeOptions(input ?? {}, defaultOptions), defaultOptions, '') as BackendLensOptions
}

const TOOLBAR_POSITIONS: readonly ToolbarPosition[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left']

const isCount = (value: unknown, min: number) => Number.isInteger(value) && (value as number) >= min
const isDuration = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0

/** Checks stricter than "the type of the default", by option path. */
const CONSTRAINTS: Record<string, { expected: string, check: (value: unknown) => boolean }> = {
  'maxRequests': { expected: 'an integer ≥ 1', check: value => isCount(value, 1) },
  'prefetch.concurrency': { expected: 'an integer ≥ 1', check: value => isCount(value, 1) },
  'nPlusOneThreshold': { expected: 'an integer ≥ 2', check: value => isCount(value, 2) },
  'retryDelays': { expected: 'an array of durations ≥ 0', check: value => Array.isArray(value) && value.every(isDuration) },
  'recordTimeoutMs': { expected: 'a duration > 0', check: value => isDuration(value) && (value as number) > 0 },
  'slowQueryMs': { expected: 'a duration ≥ 0', check: isDuration },
  'actions.windowMs': { expected: 'a duration ≥ 0', check: isDuration },
  'vueDevtools.color': { expected: 'a colour 0x000000–0xFFFFFF', check: value => isCount(value, 0) && (value as number) <= 0xFFFFFF },
  'toolbar.position': { expected: TOOLBAR_POSITIONS.join(' | '), check: value => TOOLBAR_POSITIONS.includes(value as ToolbarPosition) },
  'adapters.clockwork.webUi': { expected: 'a string or false', check: value => value === false || typeof value === 'string' },
}

/** `value` checked against the shape of `fallback` (a default), key by key. Unknown keys are kept. */
function conform(value: unknown, fallback: unknown, path: string): unknown {
  const constraint = CONSTRAINTS[path]
  if (constraint) {
    return constraint.check(value) ? value : invalid(path, value, constraint.expected, fallback)
  }
  if (Array.isArray(fallback)) {
    // Every array option without a constraint is a list of strings (patterns, names).
    return Array.isArray(value) && value.every(item => typeof item === 'string')
      ? value
      : invalid(path, value, 'an array of strings', fallback)
  }
  if (isPlainObject(fallback)) {
    if (!isPlainObject(value)) {
      return invalid(path, value, 'an object', fallback)
    }
    const result: Record<string, unknown> = { ...value }
    for (const [key, nested] of Object.entries(fallback)) {
      result[key] = conform(value[key], nested, path ? `${path}.${key}` : key)
    }
    return result
  }
  return typeof value === typeof fallback ? value : invalid(path, value, `a ${typeof fallback}`, fallback)
}

function invalid(path: string, value: unknown, expected: string, fallback: unknown): unknown {
  console.warn(`[backend-lens] option ${path}: expected ${expected}, got ${show(value)}; using the default ${show(fallback)}`)
  return structuredClone(fallback)
}

function show(value: unknown): string {
  return typeof value === 'number' || value === undefined ? String(value) : JSON.stringify(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
