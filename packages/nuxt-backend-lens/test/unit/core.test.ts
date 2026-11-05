import { describe, expect, it } from 'vitest'
import { resolveOptions } from '../../src/module'
import { defaultOptions } from '../../src/runtime/core/options'
import { AdapterRegistry } from '../../src/runtime/core/registry'
import { databaseTimeMs, toServerTimingEntry } from '../../src/runtime/core/server-timing'
import { RequestStore } from '../../src/runtime/core/store'
import type { BackendLensAdapter, RequestEntry } from '../../src/runtime/core/types'
import { displayPath, fillTemplate, httpUrl, joinPath, matchesAny, matchesPattern, resolveHeaderPath, resolveOnServer } from '../../src/runtime/core/url'
import { capturedResponse } from './helpers'

describe('url helpers', () => {
  it('resolves server paths from the root of the response origin', () => {
    expect(resolveOnServer('/__clockwork/1', 'http://a.test/api/x')).toBe('http://a.test/__clockwork/1')
    expect(resolveOnServer('_debugbar/clockwork/1', 'http://a.test/api/x/y')).toBe('http://a.test/_debugbar/clockwork/1')
    expect(resolveOnServer('https://cdn.test/r/1', 'http://a.test/api')).toBe('https://cdn.test/r/1')
  })

  it('resolves header paths only on the response origin', () => {
    expect(resolveHeaderPath('/__clockwork/', 'http://a.test/api')).toBe('http://a.test/__clockwork/')
    expect(resolveHeaderPath('_debugbar/clockwork/', 'http://a.test/api/x')).toBe('http://a.test/_debugbar/clockwork/')
    expect(resolveHeaderPath('http://a.test/cw/', 'http://a.test/api')).toBe('http://a.test/cw/')
    expect(resolveHeaderPath('https://a.test/cw/', 'http://a.test/api')).toBeUndefined()
    expect(resolveHeaderPath('//b.test/cw/', 'http://a.test/api')).toBeUndefined()
    expect(resolveHeaderPath('javascript://%0Aalert(1)//', 'http://a.test/api')).toBeUndefined()
    expect(resolveHeaderPath(null, 'http://a.test/api')).toBeUndefined()
    expect(resolveHeaderPath('', 'http://a.test/api')).toBeUndefined()
  })

  it('accepts only http(s) URLs as links', () => {
    expect(httpUrl('https://a.test/__clockwork/1')).toBe('https://a.test/__clockwork/1')
    expect(httpUrl('http://a.test/x')).toBe('http://a.test/x')
    expect(httpUrl('javascript://%0Aalert(1)')).toBeUndefined()
    expect(httpUrl('JavaScript:alert(1)')).toBeUndefined()
    expect(httpUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined()
    expect(httpUrl('/relative')).toBeUndefined()
    expect(httpUrl(undefined)).toBeUndefined()
  })

  it('joins paths and fills templates', () => {
    expect(joinPath('/__clockwork/', '/1')).toBe('/__clockwork/1')
    expect(joinPath('/_debugbar', 'open?op=get&id=x')).toBe('/_debugbar/open?op=get&id=x')
    expect(fillTemplate('open?id={id}', 'a/b')).toBe('open?id=a%2Fb')
  })

  it('displays path and query only', () => {
    expect(displayPath('http://a.test/api/books?eager=1')).toBe('/api/books?eager=1')
  })

  it('matches globs over the path or the full URL', () => {
    expect(matchesPattern('http://a.test/api/books', '/api/**')).toBe(true)
    expect(matchesPattern('http://a.test/api/books/1/reviews', '/api/**')).toBe(true)
    expect(matchesPattern('http://a.test/api/books/1', '/api/*')).toBe(false)
    expect(matchesPattern('http://a.test/api/books', '/api/*')).toBe(true)
    expect(matchesPattern('http://a.test/apix', '/api/**')).toBe(false)
    expect(matchesPattern('https://api.example.test/v1/x', 'https://api.example.test/**')).toBe(true)
    expect(matchesPattern('http://a.test/a.b', '/a?b')).toBe(true)
    expect(matchesPattern('http://a.test/ab', '/a?b')).toBe(false)
    expect(matchesPattern('http://a.test/a/b', '/a?b')).toBe(false)
    expect(matchesAny('http://a.test/sanctum/csrf-cookie', ['/api/**', '/sanctum/**'])).toBe(true)
    expect(matchesAny('http://a.test/x', [])).toBe(false)
  })
})

describe('options', () => {
  it('merges nested user options over defaults', () => {
    const options = resolveOptions({ adapters: { clockwork: { endpoint: '/cw/' } }, toolbar: { position: 'top-left' } })
    expect(options.adapters.clockwork.endpoint).toBe('/cw/')
    expect(options.adapters.clockwork.idHeader).toBe(defaultOptions.adapters.clockwork.idHeader)
    expect(options.toolbar).toEqual({ ...defaultOptions.toolbar, position: 'top-left' })
  })

  it('replaces arrays instead of concatenating them', () => {
    const options = resolveOptions({ adapterOrder: ['clockwork'], retryDelays: [0, 50] })
    expect(options.adapterOrder).toEqual(['clockwork'])
    expect(options.retryDelays).toEqual([0, 50])
  })

  it('fills in keys missing from a partial or stale runtime config', () => {
    const stale = { enabled: true, adapters: { clockwork: { enabled: true } }, toolbar: { open: true } }
    const options = resolveOptions(stale as never)
    expect(options.actions).toEqual(defaultOptions.actions)
    expect(options.adapters.serverTiming).toEqual(defaultOptions.adapters.serverTiming)
    expect(options.toolbar.open).toBe(true)
    expect(resolveOptions(undefined)).toEqual(defaultOptions)
  })

  it('does not mutate the defaults', () => {
    resolveOptions({ include: ['/x/**'] })
    expect(defaultOptions.include).toEqual([])
  })
})

function fakeAdapter(name: string, header: string): BackendLensAdapter {
  return {
    name,
    detect: response => (response.headers.get(header) ? { adapter: name, id: response.headers.get(header)!, url: `http://a.test/${name}` } : null),
    parse: (_raw, ref) => ({ id: ref.id, adapter: name, queries: [], queriesDurationMs: 0, logs: [], cache: [], timeline: [], exceptions: [] }),
  }
}

describe('adapter registry', () => {
  const both = capturedResponse('http://a.test/api', { 'phpdebugbar-id': 'd1', 'x-clockwork-id': 'c1' })

  it('keeps the configured order regardless of registration order', () => {
    const registry = new AdapterRegistry(['debugbar', 'clockwork'])
    registry.register(fakeAdapter('clockwork', 'x-clockwork-id'))
    registry.register(fakeAdapter('debugbar', 'phpdebugbar-id'))
    expect(registry.list().map(adapter => adapter.name)).toEqual(['debugbar', 'clockwork'])
    expect(registry.detect(both)?.adapter).toBe('debugbar')
  })

  it('lets a custom adapter jump the queue', () => {
    const registry = new AdapterRegistry(['debugbar', 'clockwork'])
    registry.register(fakeAdapter('debugbar', 'phpdebugbar-id'))
    registry.register(fakeAdapter('custom', 'x-clockwork-id'), { first: true })
    expect(registry.detect(both)?.adapter).toBe('custom')
  })

  it('appends unknown adapters and survives a throwing one', () => {
    const registry = new AdapterRegistry(['clockwork'])
    registry.register({ ...fakeAdapter('broken', 'x'), detect: () => {
      throw new Error('boom')
    } }, { first: true })
    registry.register(fakeAdapter('clockwork', 'x-clockwork-id'))
    expect(registry.detect(both)?.adapter).toBe('clockwork')
    registry.unregister('clockwork')
    expect(registry.detect(both)).toBeNull()
  })
})

describe('server timing', () => {
  it('keeps only network entries with metrics', () => {
    const metrics = [{ name: 'db', duration: 12.5, description: 'Database' }]
    expect(toServerTimingEntry({ name: 'u', startTime: 1, initiatorType: 'script', serverTiming: metrics })).toBeNull()
    expect(toServerTimingEntry({ name: 'u', startTime: 1, initiatorType: 'fetch', serverTiming: [] })).toBeNull()
    const entry = toServerTimingEntry({ name: 'u', startTime: 1, initiatorType: 'xmlhttprequest', serverTiming: metrics })
    expect(entry?.metrics).toEqual([{ name: 'db', durationMs: 12.5, description: 'Database' }])
    expect(databaseTimeMs(entry!.metrics)).toBe(12.5)
    expect(databaseTimeMs(entry!.metrics, ['sql'])).toBeUndefined()
  })
})

describe('request store', () => {
  const entry = (key: number, navigationId = 1): RequestEntry => ({
    key,
    method: 'GET',
    url: `http://a.test/${key}`,
    path: `/${key}`,
    status: 200,
    startTime: key,
    durationMs: 1,
    initiator: 'fetch',
    navigationId,
    serverTiming: [],
    detailsState: 'none',
  })

  it('caps the list and drops navigations that no request refers to', () => {
    const store = new RequestStore(2)
    store.upsertNavigation({ id: 1, route: '/a', startTime: 0 })
    store.upsertNavigation({ id: 2, route: '/b', startTime: 0 })
    store.add(entry(1, 1))
    store.add(entry(2, 2))
    store.add(entry(3, 2))
    expect(store.entries.map(item => item.key)).toEqual([2, 3])
    expect(store.navigations.map(item => item.id)).toEqual([2])
  })

  it('replaces entries on update and notifies listeners', () => {
    const store = new RequestStore(10)
    let calls = 0
    store.subscribe(() => calls++)
    store.add(entry(1))
    const before = store.get(1)
    store.update(1, { status: 500 })
    expect(store.get(1)).not.toBe(before)
    expect(store.get(1)?.status).toBe(500)
    expect(store.update(99, { status: 1 })).toBeUndefined()
    expect(calls).toBe(2)
  })
})

describe('clientDependencyIncludes', () => {
  it('uses nested specifiers when the app depends on the installed package', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { clientDependencyIncludes } = await import('../../src/module')
    const root = mkdtempSync(join(tmpdir(), 'lens-app-'))
    writeFileSync(join(root, 'package.json'), '{}')
    expect(clientDependencyIncludes(root)).toEqual([])

    const pkg = join(root, 'node_modules', 'nuxt-backend-lens')
    mkdirSync(pkg, { recursive: true })
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'nuxt-backend-lens', main: 'index.js' }))
    writeFileSync(join(pkg, 'index.js'), '')
    expect(clientDependencyIncludes(root)).toEqual([
      'nuxt-backend-lens > sql-formatter',
      'nuxt-backend-lens > @vue/devtools-api',
      'nuxt-backend-lens > @vue/devtools-kit',
    ])
  })

  it('falls back to plain names the app itself can resolve, and skips the rest', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { clientDependencyIncludes } = await import('../../src/module')
    const root = mkdtempSync(join(tmpdir(), 'lens-src-'))
    writeFileSync(join(root, 'package.json'), '{}')
    const dependency = join(root, 'node_modules', 'sql-formatter')
    mkdirSync(dependency, { recursive: true })
    writeFileSync(join(dependency, 'package.json'), JSON.stringify({ name: 'sql-formatter', main: 'index.js' }))
    writeFileSync(join(dependency, 'index.js'), '')
    // NODE_PATH (set by pnpm's bin shims) must not make the others look resolvable.
    expect(clientDependencyIncludes(root)).toEqual(['sql-formatter'])
  })
})
