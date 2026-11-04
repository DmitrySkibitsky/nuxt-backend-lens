// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveOptions } from '../../src/module'
import { type ActionEntry, attributeToAction, describeElement, IGNORE_ATTRIBUTE, trackActions } from '../../src/runtime/core/actions'
import { type BackendLens, createBackendLens } from '../../src/runtime/core/collector'

function html(markup: string): HTMLElement {
  document.body.innerHTML = markup
  return document.body
}

describe('describeElement', () => {
  it('prefers the explicit label, then aria-label, then visible text', () => {
    const body = html(`
      <button id="a" data-backend-lens-action="Save draft">S</button>
      <button id="b" aria-label="Close dialog">×</button>
      <a id="c" href="/books">  N+1:
        books </a>
      <button id="d"><span id="inner">Run <b>all</b></span></button>
    `)
    expect(describeElement(body.querySelector('#a'))).toBe('Save draft')
    expect(describeElement(body.querySelector('#b'))).toBe('Close dialog')
    expect(describeElement(body.querySelector('#c'))).toBe('N+1: books')
    // A click on a nested element is described by its interactive ancestor.
    expect(describeElement(body.querySelector('#inner'))).toBe('Run all')
  })

  it('never reads what was typed into a field', () => {
    const body = html(`
      <input id="email" type="email" name="email" value="secret@example.com">
      <input id="search" placeholder="Search books">
      <input id="submit" type="submit" value="Log in">
      <textarea id="body" name="body">private text</textarea>
    `)
    ;(body.querySelector('#email') as HTMLInputElement).value = 'typed@example.com'
    expect(describeElement(body.querySelector('#email'))).toBe('input email')
    expect(describeElement(body.querySelector('#search'))).toBe('input Search books')
    expect(describeElement(body.querySelector('#submit'))).toBe('Log in')
    expect(describeElement(body.querySelector('#body'))).toBe('textarea body')
  })

  it('clips long labels and falls back to tag and id', () => {
    const body = html(`<button id="long">${'word '.repeat(40)}</button><div id="empty"></div>`)
    const label = describeElement(body.querySelector('#long'))
    expect(label.length).toBe(60)
    expect(label.endsWith('…')).toBe(true)
    expect(describeElement(body.querySelector('#empty'))).toBe('div#empty')
    expect(describeElement(null)).toBe('document')
  })
})

describe('trackActions', () => {
  let stop: (() => void) | undefined
  afterEach(() => stop?.())

  it('records configured events in the capture phase and skips ignored subtrees', () => {
    const body = html(`
      <button id="go">Go</button>
      <div ${IGNORE_ATTRIBUTE}><button id="lens">Lens button</button></div>
      <form id="f" name="review"><button id="send" type="submit">Post</button></form>
    `)
    // A handler that stops propagation must not hide the action (capture phase runs first).
    body.querySelector('#go')!.addEventListener('click', event => event.stopPropagation())
    const actions: { type: string, label: string }[] = []
    stop = trackActions({ document, performance }, ['click', 'submit'], action => actions.push(action))

    ;(body.querySelector('#go') as HTMLElement).click()
    ;(body.querySelector('#lens') as HTMLElement).click()
    body.querySelector('#f')!.dispatchEvent(new Event('submit', { bubbles: true }))

    expect(actions.map(action => [action.type, action.label])).toEqual([['click', 'Go'], ['submit', 'form review']])
  })
})

describe('attributeToAction', () => {
  const actions: ActionEntry[] = [
    { id: 1, type: 'click', label: 'A', time: 100, navigationId: 1 },
    { id: 2, type: 'click', label: 'B', time: 500, navigationId: 1 },
  ]

  it('picks the latest action before the request, within the window', () => {
    expect(attributeToAction(actions, 50, 1000)).toBeUndefined()
    expect(attributeToAction(actions, 300, 1000)?.id).toBe(1)
    expect(attributeToAction(actions, 500, 1000)?.id).toBe(2)
    expect(attributeToAction(actions, 1400, 1000)?.id).toBe(2)
    expect(attributeToAction(actions, 1600, 1000)).toBeUndefined()
    expect(attributeToAction([], 10, 1000)).toBeUndefined()
  })
})

describe('action attribution in the collector', () => {
  let lens: BackendLens | undefined
  let now = 0

  beforeEach(() => {
    now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    window.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const response = new Response('{}', { headers: { 'x-clockwork-id': String(input) } })
      Object.defineProperty(response, 'url', { value: new URL(String(input), 'http://app.test').href })
      return response
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    lens?.destroy()
    vi.restoreAllMocks()
  })

  it('links requests to the click that caused them and leaves the rest unattributed', async () => {
    const body = html('<button id="run">Run all</button>')
    lens = createBackendLens(resolveOptions({ prefetch: { enabled: false } }), { window, observeServerTiming: () => () => {} })

    now = 10
    await fetch('/api/initial')
    now = 2000
    ;(body.querySelector('#run') as HTMLElement).click()
    now = 2050
    await fetch('/api/a')
    now = 2900
    await fetch('/api/b')
    now = 5000
    await fetch('/api/late')

    const [action] = lens.store.actions
    expect(action).toMatchObject({ type: 'click', label: 'Run all', time: 2000 })
    expect(lens.store.entries.map(entry => [entry.path, entry.actionId])).toEqual([
      ['/api/initial', undefined],
      ['/api/a', action!.id],
      ['/api/b', action!.id],
      ['/api/late', undefined],
    ])
  })

  it('can be switched off', async () => {
    const body = html('<button id="run">Run</button>')
    lens = createBackendLens(resolveOptions({ actions: { enabled: false } }), { window, observeServerTiming: () => () => {} })
    ;(body.querySelector('#run') as HTMLElement).click()
    await fetch('/api/a')
    expect(lens.store.actions).toHaveLength(0)
    expect(lens.store.entries[0]!.actionId).toBeUndefined()
  })
})
