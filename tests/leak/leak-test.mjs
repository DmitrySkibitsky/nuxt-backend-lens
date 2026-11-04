#!/usr/bin/env node
// Request-isolation test for long-lived workers (Octane / FrankenPHP worker mode).
//
// Fires many concurrent requests at /api/marker/{uuid}, interleaved with "noise" requests to
// /api/books (31 queries each). Then loads every marker request's debug record and asserts it holds
// exactly its own single query, its own log entry and no UUID other than its own marker. Any data
// carried over from another request (noise or another marker) fails the test.
//
// Record sources mirror the module's adapters: each one detects its record from the response
// headers and normalizes the vendor format, so the checks below are format-agnostic.
//   --source=clockwork  Clockwork protocol: X-Clockwork-Id (+ X-Clockwork-Path), served by Clockwork
//                       or by Laravel Debugbar's Clockwork emulation
//   --source=debugbar   php-debugbar native: phpdebugbar-id → {prefix}/open?op=get&id=…
//
// Usage: node tests/leak/leak-test.mjs [--source=clockwork] [--base=http://localhost:$BACKEND_PORT]
//        [--requests=400] [--concurrency=32] [--noise=1] [--debugbar-prefix=_debugbar]
// Exit code 0 = isolated, 1 = leak or error.

import { randomUUID } from 'node:crypto'

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=')
    return [key, value ?? 'true']
  }),
)

const base = args.base ?? `http://localhost:${process.env.BACKEND_PORT ?? 18000}`
const total = Number(args.requests ?? 400)
const concurrency = Number(args.concurrency ?? 32)
const noisePerMarker = Number(args.noise ?? 1)
// Defaults to the package the stand runs (DEBUG_BACKEND, from demo/.env via the test:leak script).
const sourceName = args.source ?? process.env.DEBUG_BACKEND ?? 'clockwork'

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

// Debugbar records the DB connect as a pseudo-statement (type "transaction"); its Clockwork
// emulation keeps it but drops the type. It is not a query of the request, so it is ignored.
const DEBUGBAR_PSEUDO_STATEMENTS = new Set(['Connection Established'])

/** Resolves a server path (absolute or relative, as servers send both) against the server root. */
const resolveOnServer = path => new URL(path.replace(/^\/?/, '/'), base).toString()

/**
 * @typedef {{ id: string, uri: string, queries: unknown[], logs: { message: string }[], memory?: number }} NormalizedRecord
 * @typedef {{ id: string, url: string }} RecordRef
 * @typedef {{ detect(headers: Headers): RecordRef | null, normalize(raw: any): NormalizedRecord }} RecordSource
 */

/** @type {Record<string, RecordSource>} */
const sources = {
  clockwork: {
    detect(headers) {
      const id = headers.get('x-clockwork-id')
      if (!id) return null
      const directory = (headers.get('x-clockwork-path') || '/__clockwork/').replace(/\/?$/, '/')
      return { id, url: resolveOnServer(`${directory}${id}`) }
    },
    normalize(raw) {
      return {
        id: raw.id,
        uri: raw.uri ?? '',
        queries: (raw.databaseQueries ?? []).filter(query => !DEBUGBAR_PSEUDO_STATEMENTS.has(query.query)),
        logs: raw.log ?? [],
        memory: raw.memoryUsage,
      }
    },
  },
  debugbar: {
    detect(headers) {
      const id = headers.get('phpdebugbar-id')
      if (!id) return null
      const prefix = args['debugbar-prefix'] ?? '_debugbar'
      return { id, url: resolveOnServer(`${prefix}/open?op=get&id=${encodeURIComponent(id)}`) }
    },
    normalize(raw) {
      return {
        id: raw.__meta?.id,
        uri: raw.__meta?.uri ?? '',
        queries: (raw.queries?.statements ?? []).filter(statement => statement.type === 'query'),
        logs: [...(raw.messages?.messages ?? []), ...(raw.logs?.messages ?? [])],
        memory: raw.memory?.peak_usage,
      }
    },
  },
}

const source = sources[sourceName]
if (!source) {
  console.error(`Unknown --source=${sourceName}; expected one of: ${Object.keys(sources).join(', ')}`)
  process.exit(1)
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** Runs async tasks with a fixed concurrency limit, preserving result order. */
async function pool(tasks, limit) {
  const results = Array.from({ length: tasks.length })
  let next = 0
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next++
      results[index] = await tasks[index]()
    }
  })
  await Promise.all(workers)
  return results
}

/** The record may be persisted after the response is sent, so retry 404s with backoff. */
async function fetchRecord(ref) {
  for (const delay of [0, 100, 300, 1000, 2000]) {
    if (delay) await sleep(delay)
    const response = await fetch(ref.url)
    if (response.ok) return source.normalize(await response.json())
    if (response.status !== 404) throw new Error(`${ref.url}: HTTP ${response.status}`)
  }
  throw new Error(`${ref.url}: not found after retries`)
}

async function markerRequest() {
  const marker = randomUUID()
  const sleepMs = Math.floor(Math.random() * 20)
  const response = await fetch(`${base}/api/marker/${marker}?sleep_ms=${sleepMs}`, {
    headers: { Accept: 'application/json' },
  })
  const body = await response.json()
  return { kind: 'marker', marker, echoed: body.marker, status: response.status, ref: source.detect(response.headers) }
}

async function noiseRequest() {
  const response = await fetch(`${base}/api/books`, { headers: { Accept: 'application/json' } })
  await response.arrayBuffer()
  return { kind: 'noise', status: response.status, ref: source.detect(response.headers) }
}

/**
 * @param {{ marker: string, ref: RecordRef }} sent the marker request as sent
 * @param {NormalizedRecord} record its debug record
 */
function checkRecord(sent, record) {
  const problems = []
  const mentionsMarker = value => JSON.stringify(value).includes(sent.marker)

  if (record.id !== sent.ref.id) problems.push(`record id ${record.id} != header ${sent.ref.id}`)
  if (!record.uri.includes(sent.marker)) problems.push(`uri ${record.uri} lacks marker`)
  if (record.queries.length !== 1) problems.push(`${record.queries.length} queries instead of 1`)
  const foreignQuery = record.queries.find(query => !mentionsMarker(query))
  if (foreignQuery) problems.push(`foreign query: ${JSON.stringify(foreignQuery).slice(0, 120)}`)

  // Clockwork keeps the bare message ("marker"); Debugbar formats it ("[20:02:32] LOG.info: marker {…}").
  const markerLogs = record.logs.filter(entry => /(?:^|: )marker\b/.test(String(entry.message)))
  if (markerLogs.length !== 1) problems.push(`${markerLogs.length} marker log entries instead of 1`)

  // The strongest, format-agnostic check: the only UUID anywhere in the record is our own.
  const foreignUuids = new Set(
    (JSON.stringify(record).match(UUID_PATTERN) ?? []).filter(uuid => uuid.toLowerCase() !== sent.marker),
  )
  if (foreignUuids.size) problems.push(`foreign UUIDs in record: ${[...foreignUuids].slice(0, 3).join(', ')}`)
  return problems
}

async function main() {
  console.log(`source=${sourceName} base=${base} requests=${total} concurrency=${concurrency} noise=${noisePerMarker}`)

  const tasks = []
  for (let i = 0; i < total; i++) {
    tasks.push(markerRequest)
    for (let n = 0; n < noisePerMarker; n++) tasks.push(noiseRequest)
  }

  const started = performance.now()
  const sent = await pool(tasks, concurrency)
  console.log(`sent ${sent.length} requests in ${Math.round(performance.now() - started)} ms`)

  const failures = []
  const withRef = sent.filter(entry => entry.ref)
  const ids = withRef.map(entry => entry.ref.id)

  if (sent.some(entry => entry.status !== 200)) failures.push('non-200 responses present')
  if (withRef.length !== sent.length) failures.push(`${sent.length - withRef.length} of ${sent.length} responses carry no ${sourceName} debug id`)
  if (new Set(ids).size !== ids.length) failures.push('duplicate debug ids across requests')
  for (const entry of sent.filter(candidate => candidate.kind === 'marker')) {
    if (entry.echoed !== entry.marker) failures.push(`response body marker mismatch for ${entry.marker}`)
  }

  const markers = withRef.filter(entry => entry.kind === 'marker')
  const records = await pool(markers.map(entry => () => fetchRecord(entry.ref)), 8)
  markers.forEach((entry, index) => {
    for (const problem of checkRecord(entry, records[index])) failures.push(`${entry.ref.id}: ${problem}`)
  })

  const memory = records.map(record => record.memory).filter(Number.isFinite)
  if (memory.length) {
    const mb = bytes => (bytes / 1024 / 1024).toFixed(1)
    const tenth = Math.ceil(memory.length / 10)
    const avg = values => values.reduce((sum, value) => sum + value, 0) / values.length
    console.log(
      `memory per request (peak, MB): min=${mb(Math.min(...memory))} max=${mb(Math.max(...memory))} `
      + `first10%avg=${mb(avg(memory.slice(0, tenth)))} last10%avg=${mb(avg(memory.slice(-tenth)))}`,
    )
  }

  if (failures.length) {
    console.error(`FAIL: ${failures.length} problem(s)`)
    for (const failure of failures.slice(0, 20)) console.error(`  - ${failure}`)
    process.exit(1)
  }
  console.log(`PASS: ${markers.length} marker records isolated, ${ids.length} unique debug ids`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
