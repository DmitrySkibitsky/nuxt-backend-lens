// Panel size and list/details split, adjusted by dragging and kept in localStorage per shell. Limits
// that depend on the viewport or the panel live in CSS (min() / clamp()), so the stored numbers
// never have to be re-validated when the window changes.

import { ref, type Ref } from 'vue'
import type { ToolbarPosition } from '../core/options'

export interface PanelLayout {
  /** Panel width in px (toolbar only). */
  width: number
  /** Panel height in px (toolbar only). */
  height: number
  /** Request list width in px. */
  listWidth: number
}

export const DEFAULT_LAYOUT: PanelLayout = { width: 1100, height: 560, listWidth: 420 }

export const LAYOUT_LIMITS = {
  minWidth: 480,
  minHeight: 240,
  minListWidth: 200,
  /** Space the details pane keeps when the list grows. */
  minDetailsWidth: 240,
}

/** Keyboard step for the resize handles. */
export const KEYBOARD_STEP = 16

export type LayoutMode = 'toolbar' | 'embedded'

const storageKey = (mode: LayoutMode) => `backend-lens:layout:${mode}`

export type Edge = 'left' | 'right' | 'top' | 'bottom'

/** The panel edges that face the page: those opposite the corner the toolbar is anchored to. */
export function resizableEdges(position: ToolbarPosition): { x: 'left' | 'right', y: 'top' | 'bottom' } {
  return {
    x: position.endsWith('right') ? 'left' : 'right',
    y: position.startsWith('bottom') ? 'top' : 'bottom',
  }
}

/**
 * Size after dragging an edge by `delta` px (pointer movement along the axis). Dragging the left or
 * top edge outwards means a negative delta, so it grows the panel. The result stays within
 * [min, max], so a drag past a limit never builds up a dead zone on the way back.
 */
export function resized(start: number, delta: number, edge: Edge, min: number, max: number): number {
  const grow = edge === 'left' || edge === 'top' ? -delta : delta
  return Math.round(Math.min(Math.max(start + grow, min), Math.max(min, max)))
}

function isLayout(value: unknown): value is Partial<PanelLayout> {
  return typeof value === 'object' && value !== null
}

function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/** Stored layout merged over the defaults; storage may be unavailable or hold anything. */
export function loadLayout(mode: LayoutMode, storage: Storage | undefined): PanelLayout {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(storageKey(mode)) ?? 'null')
    if (isLayout(parsed)) {
      return {
        width: positive(parsed.width, DEFAULT_LAYOUT.width),
        height: positive(parsed.height, DEFAULT_LAYOUT.height),
        listWidth: positive(parsed.listWidth, DEFAULT_LAYOUT.listWidth),
      }
    }
  }
  catch {
    // Blocked storage or a corrupt value: the defaults apply.
  }
  return { ...DEFAULT_LAYOUT }
}

export function saveLayout(mode: LayoutMode, layout: PanelLayout, storage: Storage | undefined): void {
  try {
    storage?.setItem(storageKey(mode), JSON.stringify(layout))
  }
  catch {
    // Blocked storage or quota: the size just does not survive a reload.
  }
}

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  }
  catch {
    return undefined
  }
}

/** Reactive layout for one shell, persisted when a drag ends or a handle is reset. */
export function usePanelLayout(mode: LayoutMode, storage: Storage | undefined = browserStorage()): {
  layout: Ref<PanelLayout>
  set: (key: keyof PanelLayout, value: number) => void
  reset: (key: keyof PanelLayout) => void
  persist: () => void
} {
  const layout = ref(loadLayout(mode, storage))
  const persist = () => saveLayout(mode, layout.value, storage)
  return {
    layout,
    set: (key, value) => {
      layout.value = { ...layout.value, [key]: value }
    },
    reset: (key) => {
      layout.value = { ...layout.value, [key]: DEFAULT_LAYOUT[key] }
      persist()
    },
    persist,
  }
}
