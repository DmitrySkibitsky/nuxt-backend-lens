import type { BackendLensAdapter, CapturedResponse, RecordRef } from './types'

export interface RegisterOptions {
  /** Put the adapter ahead of every other one instead of after the configured order. */
  first?: boolean
}

/**
 * Ordered adapter registry. One response yields at most one record: the first adapter (by order)
 * that detects it wins — e.g. Debugbar's Clockwork emulation sends both `phpdebugbar-id` and
 * `X-Clockwork-Id`, and the configured order decides which reader is used.
 */
export class AdapterRegistry {
  private readonly adapters = new Map<string, BackendLensAdapter>()
  private order: string[]

  constructor(order: readonly string[] = []) {
    this.order = [...order]
  }

  /**
   * Adds or replaces an adapter. A name already present in the order keeps its position (so the
   * configured `adapterOrder` holds); unknown names go last, or first with `{ first: true }`.
   */
  register(adapter: BackendLensAdapter, options: RegisterOptions = {}): void {
    this.adapters.set(adapter.name, adapter)
    if (options.first) {
      this.order = [adapter.name, ...this.order.filter(name => name !== adapter.name)]
    }
    else if (!this.order.includes(adapter.name)) {
      this.order.push(adapter.name)
    }
  }

  unregister(name: string): void {
    this.adapters.delete(name)
    this.order = this.order.filter(entry => entry !== name)
  }

  get(name: string): BackendLensAdapter | undefined {
    return this.adapters.get(name)
  }

  /** Registered adapters in priority order. */
  list(): BackendLensAdapter[] {
    return this.order.flatMap((name) => {
      const adapter = this.adapters.get(name)
      return adapter ? [adapter] : []
    })
  }

  detect(response: CapturedResponse): RecordRef | null {
    for (const adapter of this.list()) {
      try {
        const ref = adapter.detect(response)
        if (ref) {
          return ref
        }
      }
      catch (error) {
        console.warn(`[backend-lens] adapter "${adapter.name}" failed to detect`, error)
      }
    }
    return null
  }
}
