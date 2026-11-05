# Adapters

An adapter turns one wire format into the module's normalized model. The UI, the analysis and
the timeline know only that model: nothing outside an adapter knows a vendor format.

## The contract

```ts
interface BackendLensAdapter {
  name: string
  /** Read the response headers; say where the record lives, or null. */
  detect(response: CapturedResponse): RecordRef | null
  /** Turn the raw record into the normalized model. */
  parse(raw: unknown, ref: RecordRef): DebugDetails
}

interface RecordRef {
  adapter: string
  id: string
  url: string          // absolute URL of the raw record
  webUrl?: string      // optional link to the source's own UI
  init?: RequestInit   // extra fetch options (headers, credentials)
  inline?: unknown     // the record itself, when the response already carries it
}
```

Both functions are **pure**. Fetching, retries, caching and the UI belong to the module, which
makes adapters trivially testable against captured records.

- When `inline` is set (the Server-Timing adapter does this), the module parses it directly and
  fetches nothing.
- Otherwise it fetches `url` with `credentials: 'include'` plus `init`, retrying 404s with
  `retryDelays`.

The normalized model (`DebugDetails`, abridged):

```ts
interface DebugDetails {
  id: string
  adapter: string
  method?: string
  uri?: string
  status?: number
  controller?: string
  startedAt?: number        // epoch seconds of the request start
  durationMs?: number
  memoryBytes?: number
  queries: { sql: string, bindings?: unknown[], durationMs: number, time?: number, callSite?: StackFrame, trace: StackFrame[] }[]
  queriesDurationMs: number
  logs: { level: string, message: string, context?: unknown, time?: number, exception?: DebugException }[]
  cache: { type: 'hit' | 'miss' | 'write' | 'delete' | 'other', key: string, durationMs?: number }[]
  timeline: { label: string, startMs: number, durationMs: number }[]
  exceptions: { type: string, message: string, file?: string, line?: number | null }[]
  note?: string             // shown with the details, e.g. what the source cannot provide
}
```

Full types: `packages/nuxt-backend-lens/src/runtime/core/types.ts`, exported from the package.

## Built-in adapters

| Adapter         | Detects                                         | Record                                   |
|-----------------|-------------------------------------------------|------------------------------------------|
| `debugbar`      | `phpdebugbar-id`                                | `{prefix}/open?op=get&id={id}`           |
| `clockwork`     | `X-Clockwork-Id` (+ `X-Clockwork-Path`)         | `{path or endpoint}/{id}`                |
| `server-timing` | a readable `Server-Timing` header with metrics  | inline: the header itself                |

Record URLs are resolved against the **response's** origin, so an API on another origin works
without configuration once CORS allows it. A relative `X-Clockwork-Path` (`_debugbar/clockwork/`)
means "from the server root".

An `X-Clockwork-Path` that leads off the response's origin (another host or port, `//host`, a
non-http scheme) is ignored in favour of `endpoint`. Any API the app calls can send that header,
and records are fetched with the page's credentials, so a header must not choose where they go.
Configured paths (`endpoint`, `webUi`, `prefix`) are trusted and may be full URLs. The panel links
only to http(s) URLs, whatever an adapter returns.

### Format differences they normalize

All observed on the demo stand with Clockwork 5.3.5 and fruitcake/laravel-debugbar 4.4.5.

| Aspect            | Clockwork                          | Debugbar (native)                                         |
|-------------------|------------------------------------|-----------------------------------------------------------|
| SQL bindings      | inlined into `query`               | values inlined into `sql`, plus separate `params`          |
| Keyword case      | upper-cased (`SELECT … FROM`)      | as written (`select … from`)                              |
| Durations         | milliseconds                       | seconds                                                    |
| Call site         | `trace[]` with `isVendor`          | `source` (Debugbar's own pick) and `backtrace[]`           |
| Pseudo-statements | none                               | `Connection Established` (`type: "transaction"`) on connect |
| Log entries       | bare `message` plus `context`      | `"[20:02:32] LOG.info: text {…}"` plus `context_json`      |
| Cache events      | `cacheQueries[].type`: `hit`, `miss`, `write`, `delete` | `cache.measures[].label`: `"missed\tkey"`, `"written\tkey"`, `"forgotten\tkey"` |
| Exceptions        | inside `log[].exception`           | a separate `exceptions` collector                          |
| Peak memory       | per request                        | per worker, cumulative under Octane                        |

## Writing your own

Register an adapter from a client plugin. `useBackendLens()` returns the running lens (`undefined`
on the server and when the module is disabled).

```ts
// plugins/backend-lens.client.ts
export default defineNuxtPlugin(() => {
  useBackendLens()?.registry.register(defineBackendLensAdapter({
    name: 'my-backend',
    detect(response) {
      const id = response.headers.get('x-debug-id')
      return id ? { adapter: 'my-backend', id, url: new URL(`/_debug/${id}`, response.url).href } : null
    },
    parse(raw, ref) {
      const record = raw as { sql: { text: string, ms: number }[] }
      return {
        id: ref.id,
        adapter: 'my-backend',
        queries: record.sql.map(query => ({ sql: query.text, durationMs: query.ms, trace: [] })),
        queriesDurationMs: record.sql.reduce((sum, query) => sum + query.ms, 0),
        logs: [],
        cache: [],
        timeline: [],
        exceptions: [],
      }
    },
  }), { first: true })
})
```

- `register(adapter, { first: true })` puts it ahead of the built-in ones. Without `first`, a name
  already in `adapterOrder` keeps its place and an unknown name goes last.
- Provide `callSite` (the first application frame) on queries to get N+1 detection; without it,
  every query counts as coming from the same, unknown place.
- A response carrying everything itself can return `inline` from `detect`. Then `url` is only
  shown as the "raw record" link.

## Testing an adapter

The built-in adapters are tested against **records captured from the demo stand**
(`packages/nuxt-backend-lens/test/fixtures/records/`), refreshed with
`node packages/nuxt-backend-lens/scripts/capture-fixtures.mjs --source=clockwork|debugbar`. The
script redacts secrets before writing (`scripts/redact.mjs`): environment-style names (`*KEY*`,
`*SECRET*`, `*PASSWORD*`, `*TOKEN*`), credential headers (also as `HTTP_*` server variables), form
fields such as `password` and `_token`, passwords in URLs, cookies and session data. It then scans
the fixture for anything still credential-like (bcrypt hashes, bearer and Sanctum tokens, session
cookies, `base64:` keys, `user:password@` URLs) and does not write it if something is found, nor
when the record never appeared. `--out=DIR` writes elsewhere, to try a capture without touching
the committed fixtures. A unit test runs the same scan over the committed fixtures.
