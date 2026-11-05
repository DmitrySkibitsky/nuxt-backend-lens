// Patches window.fetch and XMLHttpRequest so every HTTP client is seen ($fetch / ofetch, useFetch,
// nuxt-auth-sanctum, axios, raw fetch, XHR). Only response headers are read — bodies are never
// touched — and failures inside the lens never reach the application.

import type { CapturedResponse, HeaderReader } from './types'

export type ResponseListener = (response: CapturedResponse) => void

export interface InterceptorHandle {
  /** The unpatched fetch: the lens loads records with it, so its own requests are never captured. */
  originalFetch: typeof fetch
  /** Stops recording for good: undoes the patches, or makes them pass calls through when wrapped. */
  restore(): void
}

interface PatchableWindow {
  fetch: typeof fetch
  XMLHttpRequest: typeof XMLHttpRequest
  location: { href: string }
  performance: { now(): number }
}

const INSTALLED = Symbol.for('backend-lens.interceptor')

interface XhrMeta {
  method: string
  url: string
}

const xhrMeta = new WeakMap<XMLHttpRequest, XhrMeta>()

export function installInterceptor(target: PatchableWindow, listener: ResponseListener): InterceptorHandle {
  const existing = (target as unknown as Record<symbol, InterceptorHandle | undefined>)[INSTALLED]
  if (existing) {
    // HMR or a second app instance: never stack patches.
    existing.restore()
  }

  const notify = (response: CapturedResponse) => {
    try {
      listener(response)
    }
    catch (error) {
      console.warn('[backend-lens] failed to record a response', error)
    }
  }

  const originalFetch = target.fetch
  const now = () => target.performance.now()
  // A patch something else has wrapped cannot be taken out of the chain: after restore() it only
  // passes calls through, so a replaced lens stops recording.
  let restored = false

  const patchedFetch: typeof fetch = async function (input, init) {
    if (restored) {
      return originalFetch.call(target as unknown as typeof globalThis, input, init)
    }
    const startTime = now()
    const method = (init?.method ?? (isRequest(input) ? input.method : 'GET')).toUpperCase()
    const requestUrl = absoluteUrl(isRequest(input) ? input.url : String(input), target.location.href)
    const response = await originalFetch.call(target as unknown as typeof globalThis, input, init)
    notify({
      url: response.url || requestUrl,
      method,
      status: response.status,
      headers: response.headers,
      startTime,
      endTime: now(),
      initiator: 'fetch',
    })
    return response
  }

  const xhrPrototype = target.XMLHttpRequest.prototype
  const originalOpen = xhrPrototype.open
  const originalSend = xhrPrototype.send

  const patchedOpen = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    xhrMeta.set(this, { method: method.toUpperCase(), url: absoluteUrl(String(url), target.location.href) })
    return (originalOpen as (...args: unknown[]) => void).call(this, method, url, ...rest)
  } as typeof xhrPrototype.open

  const patchedSend = function (this: XMLHttpRequest, body?: Parameters<XMLHttpRequest['send']>[0]) {
    const meta = xhrMeta.get(this)
    if (!meta || restored) {
      return originalSend.call(this, body)
    }
    const startTime = now()
    const onLoadEnd = () => {
      if (this.status === 0 || restored) {
        return
      }
      notify({
        url: this.responseURL || meta.url,
        method: meta.method,
        status: this.status,
        headers: xhrHeaders(this),
        startTime,
        endTime: now(),
        initiator: 'xhr',
      })
    }
    // Before send(): a synchronous XHR fires loadend inside it.
    this.addEventListener('loadend', onLoadEnd, { once: true })
    try {
      return originalSend.call(this, body)
    }
    catch (error) {
      // Not sent (e.g. send() on a request in flight): that request's own listener reports it.
      this.removeEventListener('loadend', onLoadEnd)
      throw error
    }
  }

  target.fetch = patchedFetch
  xhrPrototype.open = patchedOpen
  xhrPrototype.send = patchedSend

  const handle: InterceptorHandle = {
    originalFetch,
    restore() {
      restored = true
      // Only undo our own patches: something may have wrapped them since.
      if (target.fetch === patchedFetch) {
        target.fetch = originalFetch
      }
      if (xhrPrototype.open === patchedOpen) {
        xhrPrototype.open = originalOpen
      }
      if (xhrPrototype.send === patchedSend) {
        xhrPrototype.send = originalSend
      }
      const registry = target as unknown as Record<symbol, unknown>
      if (registry[INSTALLED] === handle) {
        registry[INSTALLED] = undefined
      }
    },
  }
  ;(target as unknown as Record<symbol, InterceptorHandle>)[INSTALLED] = handle
  return handle
}

function isRequest(input: unknown): input is Request {
  return typeof Request !== 'undefined' && input instanceof Request
}

function absoluteUrl(url: string, base: string): string {
  try {
    return new URL(url, base).toString()
  }
  catch {
    return url
  }
}

function xhrHeaders(xhr: XMLHttpRequest): HeaderReader {
  return {
    get(name) {
      try {
        return xhr.getResponseHeader(name)
      }
      catch {
        return null
      }
    },
  }
}
