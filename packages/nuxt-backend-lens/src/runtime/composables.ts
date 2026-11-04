import { useNuxtApp } from '#app'
import type { BackendLens } from './core/collector'
import type { BackendLensAdapter } from './core/types'

/**
 * The running lens, or `undefined` on the server and when the module is disabled.
 * Register custom adapters with `useBackendLens()?.registry.register(adapter)`.
 */
export function useBackendLens(): BackendLens | undefined {
  // Via unknown: the provide() type and this import may come from different copies (stub builds).
  return useNuxtApp().$backendLens as unknown as BackendLens | undefined
}

/** Typing helper for custom adapters. */
export function defineBackendLensAdapter(adapter: BackendLensAdapter): BackendLensAdapter {
  return adapter
}
