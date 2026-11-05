import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { findLeaks, REDACTED, redact } from '../../scripts/redact.mjs'

const bcrypt = '$2y$12$abcdefghijklmnopqrstuuJ8r6g7vX0hJm1i2kL3n4o5p6q7r8s9tA'

describe('fixture redaction', () => {
  it('replaces environment secrets, credential headers, form secrets and URL passwords', () => {
    const record = {
      request_server: {
        APP_KEY: 'base64:c2VjcmV0c2VjcmV0c2VjcmV0c2VjcmV0',
        AWS_SECRET_ACCESS_KEY: 'abc',
        HTTP_COOKIE: 'laravel_session=eyJpdiI6IjEyMzQ1Njc4OTAiLCJ2YWx1ZSI6',
        HTTP_AUTHORIZATION: 'Bearer 1|abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN',
        DB_URL: 'pgsql://demo:s3cret@db:5432/demo',
        APP_NAME: 'Laravel',
      },
      headers: { cookie: ['XSRF-TOKEN=eyJpdiI6IkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFla'] },
      request_request: { email: 'demo@example.com', password: 'password', _token: 'csrf-token-value' },
      cookies: { laravel_session: 'x' },
      cacheQueries: [{ key: 'books:count', type: 'hit' }],
    }
    const result = redact(record)
    expect(result.request_server).toEqual({
      APP_KEY: REDACTED,
      AWS_SECRET_ACCESS_KEY: REDACTED,
      HTTP_COOKIE: REDACTED,
      HTTP_AUTHORIZATION: REDACTED,
      DB_URL: `pgsql://${REDACTED}@db:5432/demo`,
      APP_NAME: 'Laravel',
    })
    expect(result.headers.cookie).toEqual([REDACTED])
    expect(result.request_request).toEqual({ email: 'demo@example.com', password: REDACTED, _token: REDACTED })
    expect(result.cookies).toBe(REDACTED)
    expect(result.cacheQueries).toEqual(record.cacheQueries)
    expect(findLeaks(result)).toEqual([])
  })

  it('finds credentials that redaction did not anticipate', () => {
    const leaks = findLeaks({
      logs: [{ message: `hash ${bcrypt}` }, { message: 'sent Authorization: Bearer abcdefghijklmnop0123' }],
      queries: [{ bindings: ['3|abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN'] }],
      config: { redis: 'redis://default:hunter2@cache:6379' },
      raw: 'Cookie: laravel_session=eyJpdiI6IjEyMzQ1Njc4OTAiLCJ2YWx1ZSI6',
    })
    expect(leaks).toEqual([
      '$.logs[0].message: bcrypt hash',
      '$.logs[1].message: bearer token',
      '$.queries[0].bindings[0]: Sanctum token',
      '$.config.redis: credentials in a URL',
      '$.raw: session or XSRF cookie',
    ])
  })

  it('finds nothing in the committed fixtures', () => {
    // node:path, not `new URL(…, import.meta.url)`: happy-dom may replace the global URL.
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'records')
    const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.json'))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(findLeaks(JSON.parse(readFileSync(join(root, file), 'utf8'))), file).toEqual([])
    }
  })
})
