// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveOptions } from '../../src/module'
import { type BackendLens, createBackendLens } from '../../src/runtime/core/collector'
import { mountToolbar } from '../../src/runtime/shells/toolbar'

let lens: BackendLens | undefined

afterEach(() => {
  document.getElementById('backend-lens-toolbar')?.remove()
  lens?.destroy()
  lens = undefined
})

function subscriptions(target: BackendLens) {
  const active = new Set<number>()
  let next = 0
  const subscribe = target.store.subscribe.bind(target.store)
  vi.spyOn(target.store, 'subscribe').mockImplementation((listener) => {
    const id = next++
    active.add(id)
    const unsubscribe = subscribe(listener)
    return () => {
      active.delete(id)
      unsubscribe()
    }
  })
  return active
}

describe('toolbar shell', () => {
  it('unmounts the previous toolbar when mounted again', () => {
    lens = createBackendLens(resolveOptions({}), { window, observeServerTiming: () => () => {} })
    const active = subscriptions(lens)

    mountToolbar(lens)
    mountToolbar(lens)
    const hosts = document.querySelectorAll('#backend-lens-toolbar')
    expect(hosts).toHaveLength(1)
    expect(hosts[0]!.shadowRoot?.querySelector('[data-testid="backend-lens-badge"]')).not.toBeNull()
    expect(active.size).toBe(1)
  })

  it('unmounts once, however often the returned function is called', () => {
    lens = createBackendLens(resolveOptions({}), { window, observeServerTiming: () => () => {} })
    const active = subscriptions(lens)

    const unmount = mountToolbar(lens)
    unmount()
    unmount()
    expect(document.getElementById('backend-lens-toolbar')).toBeNull()
    expect(active.size).toBe(0)
  })
})
