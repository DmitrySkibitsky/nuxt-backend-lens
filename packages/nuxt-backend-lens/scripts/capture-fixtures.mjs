#!/usr/bin/env node
// Captures real debug records from the running demo stand into test/fixtures/records/<source>/.
// Each fixture holds the response headers the adapters detect from and the raw record they parse,
// so adapter tests run against actual vendor output instead of hand-written guesses.
//
//   make restart BACKEND=clockwork  →  node scripts/capture-fixtures.mjs --source=clockwork
//   make restart BACKEND=debugbar   →  node scripts/capture-fixtures.mjs --source=debugbar
//
// Options: --base=http://localhost:$BACKEND_PORT (default port 18000), --out=DIR (default: the
// fixtures directory of the source).
//
// Records are redacted before they are written (scripts/redact.mjs): Debugbar's request collector
// dumps the server environment, and both packages keep cookies and session data. A fixture that
// still looks like it holds a credential, or whose record never appeared, is not written.
// Header names and record paths are the module's defaults, read from its source (Node strips types).

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultOptions } from '../src/runtime/core/options.ts'
import { fillTemplate, joinPath, resolveHeaderPath, resolveOnServer } from '../src/runtime/core/url.ts'
import { findLeaks, redact } from './redact.mjs'

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=')
  return [key, value ?? 'true']
}))

const base = args.base ?? `http://localhost:${process.env.BACKEND_PORT ?? 18000}`
const source = args.source
const scenarios = {
  'books-n-plus-one': '/api/books',
  'books-eager': '/api/books?eager=1',
  'stats-duplicates': '/api/stats',
  'slow': '/api/slow',
  'cached-miss': '/api/cached?fresh=1',
  'cached-hit': '/api/cached',
  'logs': '/api/logs',
  'boom': '/api/boom',
}

const { clockwork, debugbar, serverTiming } = defaultOptions.adapters
// The same URLs the adapters build (core/adapters/*.ts), without importing them: their extensionless
// imports need a bundler.
const sources = {
  clockwork: {
    headers: [clockwork.idHeader, clockwork.pathHeader],
    recordUrl(response) {
      const id = response.headers.get(clockwork.idHeader)
      const directory = resolveHeaderPath(response.headers.get(clockwork.pathHeader), response.url) ?? clockwork.endpoint
      return id && resolveOnServer(joinPath(directory, encodeURIComponent(id)), response.url)
    },
  },
  debugbar: {
    headers: [debugbar.idHeader],
    recordUrl(response) {
      const id = response.headers.get(debugbar.idHeader)
      return id && resolveOnServer(joinPath(debugbar.prefix, fillTemplate(debugbar.openPath, id)), response.url)
    },
  },
}

const selected = sources[source]
if (!selected) {
  console.error(`--source must be one of: ${Object.keys(sources).join(', ')}`)
  process.exit(1)
}
const keptHeaders = new Set([...selected.headers, serverTiming.header].map(name => name.toLowerCase()))

const outDir = args.out ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'records', source)
await mkdir(outDir, { recursive: true })

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

for (const [name, path] of Object.entries(scenarios)) {
  const response = await fetch(new URL(path, base), { headers: { Accept: 'application/json' } })
  await response.arrayBuffer()
  const url = selected.recordUrl(response)
  if (!url) {
    console.error(`${source}/${name}: the response carries no ${source} id; fixture left as it was`)
    process.exitCode = 1
    continue
  }

  let record
  for (const delay of [0, 100, 300, 1000]) {
    await sleep(delay)
    const recordResponse = await fetch(url)
    if (recordResponse.ok) {
      record = await recordResponse.json()
      break
    }
  }
  if (record === undefined) {
    console.error(`${source}/${name}: no record at ${url}; fixture left as it was`)
    process.exitCode = 1
    continue
  }

  const headers = Object.fromEntries([...response.headers].filter(([key]) => keptHeaders.has(key.toLowerCase())))
  const fixture = { request: { method: 'GET', path }, response: { status: response.status, headers }, record: redact(record) }
  const leaks = findLeaks(fixture)
  if (leaks.length) {
    console.error(`${source}/${name}: possible secrets after redaction; fixture left as it was:\n  ${leaks.join('\n  ')}`)
    process.exitCode = 1
    continue
  }
  await writeFile(join(outDir, `${name}.json`), `${JSON.stringify(fixture, null, 2)}\n`)
  console.log(`${source}/${name}: HTTP ${response.status}, record ok`)
}
