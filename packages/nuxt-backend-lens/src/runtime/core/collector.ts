// Wires the interceptor, adapters, Server-Timing and the store together. Framework-free: the Nuxt
// plugin feeds it route changes, the UI reads the store.

import { type ActionTarget, attributeToAction, trackActions } from './actions'
import { createClockworkAdapter } from './adapters/clockwork'
import { createDebugbarAdapter } from './adapters/debugbar'
import { createServerTimingAdapter } from './adapters/server-timing'
import { installInterceptor } from './interceptor'
import type { BackendLensOptions } from './options'
import { AdapterRegistry } from './registry'
import { observeServerTiming, type ServerTimingEntry } from './server-timing'
import { RequestStore } from './store'
import type { CapturedResponse, RecordRef, RequestEntry } from './types'
import { displayPath, matchesAny } from './url'

/** Max distance between a request's start and its resource timing entry's start. */
const TIMING_MATCH_WINDOW_MS = 250
/** Unmatched timing entries kept for requests that are reported after their entry. */
const PENDING_TIMING_LIMIT = 50

export interface BackendLensEnvironment {
  /** The page window; action tracking needs its `document`. */
  window: Parameters<typeof installInterceptor>[0] & Partial<ActionTarget>
  observeServerTiming?: typeof observeServerTiming
}

export interface BackendLens {
  readonly options: BackendLensOptions
  readonly registry: AdapterRegistry
  readonly store: RequestStore
  /**
   * Reports the route of a navigation that is starting. The first call names the initial
   * navigation (requests made before the router existed belong to it); later calls start new ones.
   */
  setRoute(route: string): void
  readonly navigationId: number
  /** Loads (or reloads) a request's debug record. */
  load(key: number): Promise<void>
  clear(): void
  destroy(): void
}

export function createBackendLens(options: BackendLensOptions, environment: BackendLensEnvironment): BackendLens {
  const registry = new AdapterRegistry(options.adapterOrder)
  if (options.adapters.debugbar.enabled) {
    registry.register(createDebugbarAdapter(options.adapters.debugbar))
  }
  if (options.adapters.clockwork.enabled) {
    registry.register(createClockworkAdapter(options.adapters.clockwork))
  }
  if (options.adapters.serverTiming.enabled) {
    registry.register(createServerTimingAdapter(options.adapters.serverTiming))
  }

  const store = new RequestStore(options.maxRequests)
  let nextKey = 1
  let nextActionId = 1
  let navigationId = 1
  let routeKnown = false
  store.upsertNavigation({ id: navigationId, route: '', startTime: environment.window.performance.now() })
  let pendingTimings: ServerTimingEntry[] = []

  const loads = new Map<number, Promise<void>>()
  const prefetchQueue: number[] = []
  let activePrefetches = 0

  // `interceptor` is installed below, once the handlers exist; records load only after that.
  function fetchRecord(ref: RecordRef): Promise<Response> {
    const { originalFetch } = interceptor
    // Also bounds reading the body, which is part of the same fetch.
    const timeout = AbortSignal.timeout(options.recordTimeoutMs)
    const own = ref.init?.signal
    return originalFetch(ref.url, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      ...ref.init,
      signal: own ? AbortSignal.any([timeout, own]) : timeout,
    })
  }

  function attachTiming(entry: RequestEntry, timing: ServerTimingEntry): void {
    store.update(entry.key, { serverTiming: timing.metrics })
  }

  function onTiming(timing: ServerTimingEntry): void {
    const candidate = closestRequest(store.entries, timing)
    if (candidate) {
      attachTiming(candidate, timing)
      return
    }
    pendingTimings = [...pendingTimings.slice(-(PENDING_TIMING_LIMIT - 1)), timing]
  }

  function onResponse(response: CapturedResponse): void {
    if (matchesAny(response.url, options.exclude)) {
      return
    }
    const ref = registry.detect(response) ?? undefined
    if (!ref && !matchesAny(response.url, options.include)) {
      return
    }

    const action = options.actions.enabled
      ? attributeToAction(store.actions, response.startTime, options.actions.windowMs)
      : undefined

    const entry: RequestEntry = {
      key: nextKey++,
      method: response.method,
      url: response.url,
      path: displayPath(response.url),
      status: response.status,
      startTime: response.startTime,
      durationMs: response.endTime - response.startTime,
      initiator: response.initiator,
      navigationId,
      actionId: action?.id,
      ref,
      serverTiming: [],
      detailsState: ref ? 'idle' : 'none',
    }
    store.add(entry)

    const timingIndex = pendingTimings.findIndex(timing => isSameRequest(entry, timing))
    if (timingIndex !== -1) {
      attachTiming(entry, pendingTimings[timingIndex]!)
      pendingTimings = pendingTimings.filter((_, index) => index !== timingIndex)
    }

    if (ref && options.prefetch.enabled) {
      prefetchQueue.push(entry.key)
      pumpPrefetch()
    }
  }

  function pumpPrefetch(): void {
    while (activePrefetches < Math.max(1, options.prefetch.concurrency) && prefetchQueue.length) {
      const key = prefetchQueue.shift()!
      activePrefetches++
      void load(key).finally(() => {
        activePrefetches--
        pumpPrefetch()
      })
    }
  }

  async function loadRecord(key: number): Promise<void> {
    const entry = store.get(key)
    if (!entry?.ref) {
      return
    }
    const adapter = registry.get(entry.ref.adapter)
    if (!adapter) {
      store.update(key, { detailsState: 'error', error: `No adapter "${entry.ref.adapter}"` })
      return
    }
    store.update(key, { detailsState: 'loading', error: undefined })

    // The response carried the record itself: nothing to fetch or retry.
    if (entry.ref.inline !== undefined) {
      try {
        store.update(key, { detailsState: 'loaded', details: adapter.parse(entry.ref.inline, entry.ref) })
      }
      catch (error) {
        store.update(key, { detailsState: 'error', error: error instanceof Error ? error.message : String(error) })
      }
      return
    }

    // Retried: a 404 (the server may persist a record after responding) and a network error.
    // Not retried: other statuses, a body that is not a record (a login page), a timeout or abort.
    let lastError = 'not found'
    for (const delay of options.retryDelays.length ? options.retryDelays : [0]) {
      if (delay) {
        await sleep(delay)
      }
      let response: Response
      try {
        response = await fetchRecord(entry.ref)
      }
      catch (error) {
        lastError = describeFetchError(error, options.recordTimeoutMs)
        if (isAborted(error)) {
          break
        }
        continue
      }
      if (!response.ok) {
        lastError = `HTTP ${response.status}`
        if (response.status === 404) {
          continue
        }
        break
      }
      try {
        const details = adapter.parse(await response.json(), entry.ref)
        store.update(key, { detailsState: 'loaded', details })
        return
      }
      catch (error) {
        lastError = describeFetchError(error, options.recordTimeoutMs)
        break
      }
    }
    store.update(key, { detailsState: 'error', error: `Record ${entry.ref.id}: ${lastError}` })
  }

  function load(key: number): Promise<void> {
    const running = loads.get(key)
    if (running) {
      return running
    }
    const promise = loadRecord(key).finally(() => loads.delete(key))
    loads.set(key, promise)
    return promise
  }

  const interceptor = installInterceptor(environment.window, onResponse)
  const stopTiming = (environment.observeServerTiming ?? observeServerTiming)(onTiming)
  const { document } = environment.window
  const stopActions = options.actions.enabled && document
    ? trackActions({ document, performance: environment.window.performance }, options.actions.events, (action) => {
        store.addAction({ ...action, id: nextActionId++, navigationId })
      })
    : () => {}

  return {
    options,
    registry,
    store,
    get navigationId() {
      return navigationId
    },
    setRoute(route) {
      if (routeKnown) {
        navigationId++
        store.upsertNavigation({ id: navigationId, route, startTime: environment.window.performance.now() })
        return
      }
      routeKnown = true
      const initial = store.navigations.find(item => item.id === navigationId)
      store.upsertNavigation({ id: navigationId, route, startTime: initial?.startTime ?? 0 })
    },
    load,
    clear() {
      prefetchQueue.length = 0
      pendingTimings = []
      store.clear()
    },
    destroy() {
      prefetchQueue.length = 0
      stopActions()
      stopTiming()
      interceptor.restore()
    },
  }
}

function isSameRequest(entry: RequestEntry, timing: ServerTimingEntry): boolean {
  return entry.url === timing.url && Math.abs(entry.startTime - timing.startTime) <= TIMING_MATCH_WINDOW_MS
}

function closestRequest(entries: readonly RequestEntry[], timing: ServerTimingEntry): RequestEntry | undefined {
  let best: RequestEntry | undefined
  for (const entry of entries) {
    if (entry.serverTiming.length || !isSameRequest(entry, timing)) {
      continue
    }
    if (!best || Math.abs(entry.startTime - timing.startTime) < Math.abs(best.startTime - timing.startTime)) {
      best = entry
    }
  }
  return best
}

/** By name: a DOMException is not an Error in every DOM implementation. */
function errorName(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null ? (error as { name?: string }).name : undefined
}

/** The timeout, or the adapter's own signal, ended the fetch: another attempt would end the same way. */
function isAborted(error: unknown): boolean {
  return errorName(error) === 'TimeoutError' || errorName(error) === 'AbortError'
}

function describeFetchError(error: unknown, timeoutMs: number): string {
  if (errorName(error) === 'TimeoutError') {
    return `no answer within ${timeoutMs} ms`
  }
  return error instanceof Error ? error.message : String(error)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
