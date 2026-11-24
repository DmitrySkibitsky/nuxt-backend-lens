// Editor settings per browser (localStorage, shared by the toolbar and the DevTools tab, which are
// same-origin) and what a source link needs from its request.

import { type InjectionKey, type Ref, ref } from 'vue'
import { DEFAULT_EDITOR_SETTINGS, type EditorSettings, type EditorTarget, parseEditorSettings } from '../core/editor'
import type { SourceLocation } from '../core/types'

export const EDITOR_SETTINGS_KEY = 'backend-lens:editor'

export function loadEditorSettings(storage: Storage | undefined): EditorSettings {
  try {
    return parseEditorSettings(JSON.parse(storage?.getItem(EDITOR_SETTINGS_KEY) ?? 'null'))
  }
  catch {
    // Blocked storage or a corrupt value: paths stay plain text.
    return { ...DEFAULT_EDITOR_SETTINGS }
  }
}

export function saveEditorSettings(settings: EditorSettings, storage: Storage | undefined): void {
  try {
    storage?.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(settings))
  }
  catch {
    // Blocked storage or quota: the settings last until the page reloads.
  }
}

export function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  }
  catch {
    return undefined
  }
}

/**
 * Reactive settings that follow changes made in another window of the origin (the DevTools tab
 * and the page). Returns the ref, a setter that persists, and a stop function.
 */
export function useEditorSettings(storage: Storage | undefined = browserStorage(), target: Pick<Window, 'addEventListener' | 'removeEventListener'> | undefined = globalThis.window): [Ref<EditorSettings>, (settings: EditorSettings) => void, () => void] {
  const settings = ref(loadEditorSettings(storage))
  const onStorage = (event: StorageEvent) => {
    if (event.key === EDITOR_SETTINGS_KEY) {
      settings.value = loadEditorSettings(storage)
    }
  }
  target?.addEventListener('storage', onStorage)
  const set = (next: EditorSettings) => {
    settings.value = next
    saveEditorSettings(next, storage)
  }
  return [settings, set, () => target?.removeEventListener('storage', onStorage)]
}

/** Provided by the request details: resolves its locations and opens them. */
export interface SourceLinks {
  target: (location: SourceLocation | undefined) => EditorTarget | undefined
  /** Runs a command target; a failure is reported by the provider. */
  launch: (target: Extract<EditorTarget, { kind: 'command' }>) => void
}

export const SOURCE_LINKS: InjectionKey<SourceLinks> = Symbol('backend-lens-source-links')
