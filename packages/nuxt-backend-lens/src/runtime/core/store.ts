import type { NavigationEntry, RequestEntry } from './types'

export type StoreListener = () => void

/**
 * Framework-free request list. UIs subscribe and re-read; entries are replaced (never mutated in
 * place) so a shallow-ref based UI can rely on identity changes.
 */
export class RequestStore {
  private items: RequestEntry[] = []
  private navigationItems: NavigationEntry[] = []
  private readonly listeners = new Set<StoreListener>()

  constructor(private readonly limit: number) {}

  get entries(): readonly RequestEntry[] {
    return this.items
  }

  get navigations(): readonly NavigationEntry[] {
    return this.navigationItems
  }

  /** Adds a navigation, or updates it when the id is already known. */
  upsertNavigation(navigation: NavigationEntry): void {
    const exists = this.navigationItems.some(item => item.id === navigation.id)
    this.navigationItems = exists
      ? this.navigationItems.map(item => (item.id === navigation.id ? navigation : item))
      : [...this.navigationItems, navigation]
    this.emit()
  }

  get(key: number): RequestEntry | undefined {
    return this.items.find(entry => entry.key === key)
  }

  add(entry: RequestEntry): void {
    this.items = [...this.items, entry]
    if (this.items.length > this.limit) {
      this.items = this.items.slice(this.items.length - this.limit)
      const oldest = this.items[0]!.navigationId
      this.navigationItems = this.navigationItems.filter(item => item.id >= oldest)
    }
    this.emit()
  }

  update(key: number, patch: Partial<RequestEntry>): RequestEntry | undefined {
    let updated: RequestEntry | undefined
    this.items = this.items.map((entry) => {
      if (entry.key !== key) {
        return entry
      }
      updated = { ...entry, ...patch }
      return updated
    })
    if (updated) {
      this.emit()
    }
    return updated
  }

  clear(): void {
    this.items = []
    this.navigationItems = this.navigationItems.slice(-1)
    this.emit()
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      }
      catch (error) {
        console.warn('[backend-lens] store listener failed', error)
      }
    }
  }
}
