import { type InjectionKey, inject, type Ref, ref, shallowRef } from 'vue'
import type { ActionEntry } from '../core/actions'
import type { BackendLens } from '../core/collector'
import type { NavigationEntry, RequestEntry } from '../core/types'
import type { ColorMode } from './theme'

export interface LensUiState {
  lens: BackendLens
  entries: Ref<readonly RequestEntry[]>
  navigations: Ref<readonly NavigationEntry[]>
  actions: Ref<readonly ActionEntry[]>
  currentNavigationId: Ref<number>
  /** Decided by the shell: DevTools' mode in the tab, the app's or the system's in the toolbar. */
  colorMode: Ref<ColorMode>
}

export const LENS_UI_STATE: InjectionKey<LensUiState> = Symbol('backend-lens-ui')

/** Bridges the framework-free store into Vue refs. Returns the state and an unsubscribe function. */
export function createUiState(lens: BackendLens, colorMode: Ref<ColorMode>): [LensUiState, () => void] {
  const entries = shallowRef(lens.store.entries)
  const navigations = shallowRef(lens.store.navigations)
  const actions = shallowRef(lens.store.actions)
  const currentNavigationId = ref(lens.navigationId)

  const unsubscribe = lens.store.subscribe(() => {
    entries.value = lens.store.entries
    navigations.value = lens.store.navigations
    actions.value = lens.store.actions
    currentNavigationId.value = lens.navigationId
  })

  return [{ lens, entries, navigations, actions, currentNavigationId, colorMode }, unsubscribe]
}

export function useLensUiState(): LensUiState {
  const state = inject(LENS_UI_STATE)
  if (!state) {
    throw new Error('[backend-lens] UI state is not provided')
  }
  return state
}
