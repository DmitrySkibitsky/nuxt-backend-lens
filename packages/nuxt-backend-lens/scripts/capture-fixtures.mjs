#!/usr/bin/env node
// Captures real debug records from the running demo stand into test/fixtures/records/<source>/.
// Each fixture holds the response headers the adapters detect from and the raw record they parse,
// so adapter tests run against actual vendor output instead of hand-written guesses.
//
//   DEBUG_BACKEND=clockwork docker compose up -d   (in demo/)  →  node scripts/capture-fixtures.mjs --source=clockwork
//   DEBUG_BACKEND=debugbar  docker compose up -d   (in demo/)  →  node scripts/capture-fixtures.mjs --source=debugbar
//
// Options: --base=http://localhost:$BACKEND_PORT (default port 18000)
//
// Records are redacted before they are written: Debugbar's request collector dumps the server
// environment (it masks *PASSWORD* but not APP_KEY), and both packages keep cookies and session data.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

const recordUrl = {
  clockwork(headers) {
    const id = headers.get('x-clockwork-id')
    const directory = (headers.get('x-clockwork-path') || '/__clockwork/').replace(/^\/?/, '/').replace(/\/?$/, '/')
    return id && new URL(`${directory}${id}`, base).toString()
  },
  debugbar(headers) {
    const id = headers.get('phpdebugbar-id')
    return id && new URL(`/_debugbar/open?op=get&id=${encodeURIComponent(id)}`, base).toString()
  },
}

if (!recordUrl[source]) {
  console.error(`--source must be one of: ${Object.keys(recordUrl).join(', ')}`)
  process.exit(1)
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'records', source)
await mkdir(outDir, { recursive: true })

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const REDACTED = '[redacted]'
// Environment-style names (APP_KEY, AWS_SECRET_ACCESS_KEY, …) and credential-bearing headers.
const SECRET_ENV_NAME = /^[A-Z0-9_]*(?:KEY|SECRET|PASSWORD|TOKEN|CREDENTIAL)[A-Z0-9_]*$/
const SECRET_FIELD = /^(?:cookie|set-cookie|authorization|x-xsrf-token|x-csrf-token|php_auth_pw)$/i
// Whole collectors / fields that hold cookies or session contents.
const SECRET_CONTAINER = /^(?:cookies|sessionData|request_cookies|response_cookies|session_attributes)$/

/** Deep copy with secrets replaced. Cache keys and other lowercase `key` fields are left alone. */
function redact(value, name = '') {
  if (SECRET_CONTAINER.test(name) && value && typeof value === 'object') {
    return REDACTED
  }
  if (Array.isArray(value)) {
    return value.map(item => redact(item, name))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item, key)]))
  }
  if (typeof value === 'string' && (SECRET_ENV_NAME.test(name) || SECRET_FIELD.test(name) || value.startsWith('base64:'))) {
    return REDACTED
  }
  return value
}

for (const [name, path] of Object.entries(scenarios)) {
  const response = await fetch(new URL(path, base), { headers: { Accept: 'application/json' } })
  await response.arrayBuffer()
  const url = recordUrl[source](response.headers)
  if (!url) {
    console.error(`${name}: response carries no ${source} id`)
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

  const headers = Object.fromEntries(
    [...response.headers].filter(([key]) => /^(?:x-clockwork-|phpdebugbar-|server-timing$)/i.test(key)),
  )
  const fixture = { request: { method: 'GET', path }, response: { status: response.status, headers }, record: redact(record) }
  await writeFile(join(outDir, `${name}.json`), `${JSON.stringify(fixture, null, 2)}\n`)
  console.log(`${source}/${name}: HTTP ${response.status}, record ${record ? 'ok' : 'MISSING'}`)
}
