import { type InjectionKey, inject, type Ref, ref, shallowRef } from 'vue'
import type { BackendLens } from '../core/collector'
import type { NavigationEntry, RequestEntry } from '../core/types'

export interface LensUiState {
  lens: BackendLens
  entries: Ref<readonly RequestEntry[]>
  navigations: Ref<readonly NavigationEntry[]>
  currentNavigationId: Ref<number>
}

export const LENS_UI_STATE: InjectionKey<LensUiState> = Symbol('backend-lens-ui')

/** Bridges the framework-free store into Vue refs. Returns the state and an unsubscribe function. */
export function createUiState(lens: BackendLens): [LensUiState, () => void] {
  const entries = shallowRef(lens.store.entries)
  const navigations = shallowRef(lens.store.navigations)
  const currentNavigationId = ref(lens.navigationId)

  const unsubscribe = lens.store.subscribe(() => {
    entries.value = lens.store.entries
    navigations.value = lens.store.navigations
    currentNavigationId.value = lens.navigationId
  })

  return [{ lens, entries, navigations, currentNavigationId }, unsubscribe]
}

export function useLensUiState(): LensUiState {
  const state = inject(LENS_UI_STATE)
  if (!state) {
    throw new Error('[backend-lens] UI state is not provided')
  }
  return state
}
