# nuxt-backend-lens

A Debugbar-like panel for Nuxt SPAs: for every backend request a page makes, it shows the SQL, logs
and timing the backend recorded, right on the page.

When Nuxt serves the HTML, Laravel Debugbar cannot inject its panel, and the browser's Network tab
has no SQL. `nuxt-backend-lens` reads the debug id the backend puts on each response and loads that
request's record from the backend's own debug package.

**Supported backends**

| Package                                        | How the module finds the record                                  |
|------------------------------------------------|------------------------------------------------------------------|
| [Clockwork](https://github.com/itsgoingd/clockwork) | `X-Clockwork-Id` (+ `X-Clockwork-Path`) → `/__clockwork/{id}` |
| [Laravel Debugbar](https://github.com/fruitcake/laravel-debugbar) | `phpdebugbar-id` → `/_debugbar/open?op=get&id={id}` |
| anything else                                  | a custom adapter (see below)                                     |

Both work with Laravel Octane (FrankenPHP, verified with concurrent load).

## Status

Early development (v0). The API may change.

## Setup

### 1. Backend

Install **one** of the packages, dev-only.

**Clockwork**

```bash
composer require --dev itsgoingd/clockwork
```

```dotenv
CLOCKWORK_ENABLE=true   # set explicitly: with null Clockwork only runs for requests to localhost
```

**Laravel Debugbar**

```bash
composer require --dev fruitcake/laravel-debugbar
```

```dotenv
DEBUGBAR_ENABLED=true
DEBUGBAR_OPEN_STORAGE=true   # lets the open handler answer requests that are not from localhost
```

Under Octane, keep `DEBUGBAR_CLOCKWORK=false`. Its Clockwork emulation attaches the first request's
data to later requests of the same worker. The module reads Debugbar's native format, so it does not
need the emulation.

> With both packages installed, Debugbar turns itself on whenever `APP_DEBUG=true`. Set
> `DEBUGBAR_ENABLED=false` when Clockwork is the source.

### 2. Same origin

The browser must be able to read the debug header and to fetch the record. The simplest setup proxies
the debug paths through the SPA's origin, next to `/api`:

```caddyfile
@backend path /api/* /sanctum/* /__clockwork/* /clockwork /clockwork/* /_debugbar/*
handle @backend {
	reverse_proxy backend:8000
}
```

When the API is cross-origin, the backend must expose the headers and allow credentialed reads of
the record endpoints:

```text
Access-Control-Expose-Headers: X-Clockwork-Id, X-Clockwork-Path, phpdebugbar-id
Timing-Allow-Origin: https://your-spa.example   # for Server-Timing
```

Record URLs resolve against the **response's** origin, so a cross-origin API works without extra
configuration once CORS allows it.

### 3. Nuxt

```bash
pnpm add -D nuxt-backend-lens
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  // Development only: nothing reaches a production bundle.
  $development: {
    modules: ['nuxt-backend-lens'],
  },
})
```

A Backend badge appears in the bottom-right corner. It shows the number of requests, queries and the
DB time of the current navigation. Click it to open the panel.

## What it captures

- Every HTTP client: `$fetch` / ofetch, `useFetch`, nuxt-auth-sanctum, axios, raw `fetch`,
  `XMLHttpRequest`. The module patches `fetch` and `XMLHttpRequest` and reads only response headers,
  never bodies.
- Requests are grouped by client-side navigation. The panel shows the current page and has a toggle
  for all navigations.
- Per request:
  - queries with duration and call site (`app/Http/Resources/BookResource.php:29`), slow ones
    highlighted;
  - log entries with level and context;
  - exceptions;
  - controller, duration, memory.
- Records are loaded in the background with a small concurrency limit (`prefetch`). A 404 right
  after the response is retried, because servers may persist the record after responding.

The toolbar is a separate Vue app inside a Shadow DOM: the app's CSS does not reach it and its CSS
does not reach the app.

## Options

```ts
export default defineNuxtConfig({
  backendLens: {
    enabled: true,
    // Also list requests without debug data (status and duration only). Glob over the path or full URL.
    include: ['/api/**'],
    // Never list these.
    exclude: ['/api/health'],
    // When a response carries several ids, the first adapter in this list wins.
    adapterOrder: ['debugbar', 'clockwork'],
    adapters: {
      clockwork: {
        enabled: true,
        idHeader: 'x-clockwork-id',
        pathHeader: 'x-clockwork-path',
        endpoint: '/__clockwork/',          // used when the response has no path header
        webUi: '/clockwork/app',            // "Open in clockwork" link; `{id}` is substituted; false hides it
        ignoreStatements: ['Connection Established'],
      },
      debugbar: {
        enabled: true,
        idHeader: 'phpdebugbar-id',
        prefix: '/_debugbar',               // debugbar.route_prefix
        openPath: 'open?op=get&id={id}',
        ignoreKeys: ['clockwork'],          // record keys dropped before parsing
        statementTypes: ['query'],
      },
    },
    toolbar: {
      enabled: true,
      position: 'bottom-right',             // bottom-left | top-right | top-left
      open: false,
    },
    maxRequests: 200,
    prefetch: { enabled: true, concurrency: 2 },
    retryDelays: [0, 100, 300, 1000],
    slowQueryMs: 100,
  },
})
```

Arrays replace the defaults instead of being merged into them. Scalars can be overridden at runtime
with `NUXT_PUBLIC_BACKEND_LENS_*` environment variables.

## Custom adapters

An adapter has two pure functions. `detect` reads the response headers and returns where the record
lives. `parse` turns the raw record into the normalized model. Fetching, retries and the UI come from
the module.

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

## Security

Debug records contain real data: SQL bindings, session contents, headers. Use the module and the
backend packages in development only. On a shared staging server, put the backend package's
authentication or a gate in front of it, and keep retention short.

Laravel Debugbar's request collector also dumps the server environment. It masks `*PASSWORD*`
values, but `APP_KEY` was stored in clear in every record (fruitcake/laravel-debugbar 4.4.5,
FrankenPHP). Anyone who can read the records can read the key.

## Development

This package lives in the [nuxt-laravel-devtools](../../) workspace:

```bash
pnpm -F nuxt-backend-lens dev:prepare   # stub build + types
pnpm -F nuxt-backend-lens dev           # playground: replays records captured from the demo stand
pnpm -F nuxt-backend-lens test          # unit tests (adapters run against real captured records)
pnpm -F nuxt-backend-lens lint
pnpm -F nuxt-backend-lens test:types
```

The playground needs no PHP: a Nitro middleware replays the records in `test/fixtures/records`
through both wire formats. Refresh them from the demo stand with
`node scripts/capture-fixtures.mjs --source=clockwork|debugbar`.

End-to-end tests against the real Laravel stand live at the workspace root (`pnpm test:e2e`).
