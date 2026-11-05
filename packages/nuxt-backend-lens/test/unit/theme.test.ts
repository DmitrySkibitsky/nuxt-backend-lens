// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { defaultOptions } from '../../src/runtime/core/options'
import { documentColorMode, systemColorMode } from '../../src/runtime/ui/theme'

const classes = defaultOptions.toolbar.colorModeClasses

function mockSystem(dark: boolean) {
  const listeners = new Set<() => void>()
  const query = {
    matches: dark,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }
  vi.spyOn(window, 'matchMedia').mockReturnValue(query as unknown as MediaQueryList)
  return {
    set(next: boolean) {
      query.matches = next
      listeners.forEach(listener => listener())
    },
    listeners,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.className = ''
})

const flush = async () => {
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}

describe('systemColorMode', () => {
  it('follows the system preference and stops listening', () => {
    const system = mockSystem(false)
    const [mode, stop] = systemColorMode()
    expect(mode.value).toBe('light')
    system.set(true)
    expect(mode.value).toBe('dark')
    stop()
    expect(system.listeners.size).toBe(0)
  })
})

describe('documentColorMode', () => {
  it('reads the document class, follows changes, and falls back to the system', async () => {
    const system = mockSystem(true)
    const [mode, stop] = documentColorMode(document, classes)
    expect(mode.value).toBe('dark') // no class: system

    document.documentElement.classList.add('light')
    await flush()
    expect(mode.value).toBe('light') // the document wins over the system

    document.documentElement.classList.replace('light', 'dark')
    await flush()
    expect(mode.value).toBe('dark')

    document.documentElement.classList.remove('dark')
    system.set(false)
    await flush()
    expect(mode.value).toBe('light')
    stop()
  })

  it('follows a system change alone while the document carries no class', async () => {
    const system = mockSystem(false)
    const [mode, stop] = documentColorMode(document, classes)
    expect(mode.value).toBe('light')
    system.set(true)
    await flush()
    expect(mode.value).toBe('dark')
    stop()
  })

  it('ignores system changes while the document decides', async () => {
    const system = mockSystem(false)
    document.documentElement.classList.add('light')
    const [mode, stop] = documentColorMode(document, classes)
    system.set(true)
    await flush()
    expect(mode.value).toBe('light')
    stop()
  })

  it('reads the configured classes, e.g. @nuxtjs/color-mode with a class suffix', async () => {
    mockSystem(false)
    const [mode, stop] = documentColorMode(document, { dark: 'dark-mode', light: 'light-mode' })
    document.documentElement.classList.add('dark-mode')
    await flush()
    expect(mode.value).toBe('dark')
    stop()
  })
})
