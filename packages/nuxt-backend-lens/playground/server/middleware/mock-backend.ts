// A PHP-free stand-in for the demo backend: serves the records captured from the real stand
// (test/fixtures/records) through both wire formats.
//
//   GET /api/<scenario>?source=clockwork|debugbar  → empty JSON + the source's debug headers
//   GET /__clockwork/<id>                          → Clockwork record
//   GET /_debugbar/open?op=get&id=<id>             → php-debugbar record

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineEventHandler, getQuery, getRequestURL, setResponseHeader, setResponseStatus } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

interface Fixture {
  request: { path: string }
  response: { status: number, headers: Record<string, string> }
  record: Record<string, unknown>
}

type Source = 'clockwork' | 'debugbar'

function loadSource(root: string, source: Source): Fixture[] {
  return readdirSync(join(root, source))
    .filter(file => file.endsWith('.json'))
    .map(file => JSON.parse(readFileSync(join(root, source, file), 'utf8')) as Fixture)
}

let cache: Record<Source, Fixture[]> | undefined

function loadFixtures(root: string): Record<Source, Fixture[]> {
  cache ??= { clockwork: loadSource(root, 'clockwork'), debugbar: loadSource(root, 'debugbar') }
  return cache
}

const recordId = (source: Source, fixture: Fixture) => (source === 'clockwork'
  ? String(fixture.record.id)
  : String((fixture.record.__meta as { id: string }).id))

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  const fixtures = loadFixtures(useRuntimeConfig(event).fixturesDir as string)

  if (url.pathname.startsWith('/__clockwork/')) {
    const id = decodeURIComponent(url.pathname.slice('/__clockwork/'.length))
    const fixture = fixtures.clockwork.find(item => recordId('clockwork', item) === id)
    if (!fixture) {
      setResponseStatus(event, 404)
      return { message: 'not found' }
    }
    return fixture.record
  }

  if (url.pathname === '/_debugbar/open') {
    const fixture = fixtures.debugbar.find(item => recordId('debugbar', item) === getQuery(event).id)
    if (!fixture) {
      setResponseStatus(event, 404)
      return { message: 'not found' }
    }
    return fixture.record
  }

  if (url.pathname.startsWith('/api/')) {
    const source: Source = getQuery(event).source === 'debugbar' ? 'debugbar' : 'clockwork'
    const requested = url.pathname + url.search.replace(/[?&]source=[^&]*/, '').replace(/^&/, '?')
    const fixture = fixtures[source].find(item => item.request.path === requested)
      ?? fixtures[source].find(item => item.request.path.split('?')[0] === url.pathname)
    if (!fixture) {
      setResponseStatus(event, 404)
      return { message: `no fixture for ${requested}` }
    }
    for (const [name, value] of Object.entries(fixture.response.headers)) {
      setResponseHeader(event, name, value)
    }
    setResponseStatus(event, fixture.response.status)
    return { scenario: fixture.request.path, source }
  }
})
