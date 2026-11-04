import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CapturedResponse } from '../../src/runtime/core/types'

export const FIXTURE_ORIGIN = 'http://localhost:18000'

interface Fixture {
  request: { method: string, path: string }
  response: { status: number, headers: Record<string, string> }
  record: unknown
}

/** Loads a record captured from the demo stand by scripts/capture-fixtures.mjs. */
export function loadFixture(source: 'clockwork' | 'debugbar', name: string) {
  // node:path, not `new URL(…, import.meta.url)`: happy-dom replaces the global URL.
  const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'records', source, `${name}.json`)
  const fixture = JSON.parse(readFileSync(path, 'utf8')) as Fixture
  return {
    response: capturedResponse(`${FIXTURE_ORIGIN}${fixture.request.path}`, fixture.response.headers, fixture.response.status),
    record: fixture.record,
  }
}

export function capturedResponse(url: string, headers: Record<string, string>, status = 200): CapturedResponse {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
  return {
    url,
    method: 'GET',
    status,
    headers: { get: name => normalized.get(name.toLowerCase()) ?? null },
    startTime: 0,
    endTime: 10,
    initiator: 'fetch',
  }
}
