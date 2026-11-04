import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT, loadLayout, resizableEdges, resized, saveLayout, usePanelLayout } from '../../src/runtime/ui/layout'

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const items = new Map(Object.entries(initial))
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: key => items.get(key) ?? null,
    key: index => [...items.keys()][index] ?? null,
    removeItem: key => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  }
}

describe('resizableEdges', () => {
  it('picks the edges that face the page', () => {
    expect(resizableEdges('bottom-right')).toEqual({ x: 'left', y: 'top' })
    expect(resizableEdges('bottom-left')).toEqual({ x: 'right', y: 'top' })
    expect(resizableEdges('top-right')).toEqual({ x: 'left', y: 'bottom' })
    expect(resizableEdges('top-left')).toEqual({ x: 'right', y: 'bottom' })
  })
})

describe('resized', () => {
  it('grows when the left or top edge moves outwards', () => {
    expect(resized(600, -100, 'left', 480, 2000)).toBe(700)
    expect(resized(400, -50, 'top', 240, 2000)).toBe(450)
  })

  it('grows when the right or bottom edge moves outwards', () => {
    expect(resized(300, 80, 'right', 200, 2000)).toBe(380)
    expect(resized(400, 30, 'bottom', 240, 2000)).toBe(430)
  })

  it('stays within the limits', () => {
    expect(resized(600, 500, 'left', 480, 2000)).toBe(480)
    expect(resized(600, -5000, 'left', 480, 1400)).toBe(1400)
  })

  it('keeps the minimum when the maximum is below it (tiny viewport)', () => {
    expect(resized(600, -100, 'left', 480, 300)).toBe(480)
  })
})

describe('layout storage', () => {
  it('round-trips per shell', () => {
    const storage = memoryStorage()
    saveLayout('toolbar', { width: 900, height: 400, listWidth: 300 }, storage)
    expect(loadLayout('toolbar', storage)).toEqual({ width: 900, height: 400, listWidth: 300 })
    expect(loadLayout('embedded', storage)).toEqual(DEFAULT_LAYOUT)
  })

  it('falls back to defaults for missing, invalid or corrupt values', () => {
    expect(loadLayout('toolbar', undefined)).toEqual(DEFAULT_LAYOUT)
    const partial = memoryStorage({ 'backend-lens:layout:toolbar': '{"width":800,"height":-1,"listWidth":"x"}' })
    expect(loadLayout('toolbar', partial)).toEqual({ ...DEFAULT_LAYOUT, width: 800 })
    const corrupt = memoryStorage({ 'backend-lens:layout:toolbar': '{not json' })
    expect(loadLayout('toolbar', corrupt)).toEqual(DEFAULT_LAYOUT)
  })

  it('survives a storage that throws', () => {
    const blocked = memoryStorage()
    blocked.getItem = () => {
      throw new Error('SecurityError')
    }
    blocked.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    expect(loadLayout('toolbar', blocked)).toEqual(DEFAULT_LAYOUT)
    expect(() => saveLayout('toolbar', DEFAULT_LAYOUT, blocked)).not.toThrow()
  })
})

describe('usePanelLayout', () => {
  it('persists on demand and on reset, not on every change', () => {
    const storage = memoryStorage()
    const { layout, set, reset, persist } = usePanelLayout('toolbar', storage)

    set('width', 700)
    expect(layout.value.width).toBe(700)
    expect(storage.getItem('backend-lens:layout:toolbar')).toBeNull()

    persist()
    expect(loadLayout('toolbar', storage).width).toBe(700)

    reset('width')
    expect(layout.value.width).toBe(DEFAULT_LAYOUT.width)
    expect(loadLayout('toolbar', storage).width).toBe(DEFAULT_LAYOUT.width)
  })
})
