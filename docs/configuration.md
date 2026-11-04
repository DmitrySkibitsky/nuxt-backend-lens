# Configuration

Options go under `backendLens` in `nuxt.config`. Everything has a default; nothing below is
required.

- **Arrays replace the defaults** instead of being merged with them: `adapterOrder: ['clockwork']`
  means exactly that.
- **Scalars can be overridden at runtime** with `NUXT_PUBLIC_BACKEND_LENS_*` environment variables,
  for example `NUXT_PUBLIC_BACKEND_LENS_SQL_FORMAT=true` or `NUXT_PUBLIC_BACKEND_LENS_SLOW_QUERY_MS=50`.
- **The browser re-applies the defaults** to whatever runtime config it receives, so a partial
  override never leaves an option undefined.

```ts
export default defineNuxtConfig({
  backendLens: {
    sql: { format: true, dialect: 'postgresql' },
    slowQueryMs: 50,
  },
})
```

## General

| Option              | Default                                    | Description |
|---------------------|--------------------------------------------|-------------|
| `enabled`           | `true`                                     | Master switch, applied at build time. With `false` the module adds no code at all. Prefer adding the module under `$development`, or switch it with an env variable for staging builds. |
| `include`           | `[]`                                       | Also list requests **without** debug data (status and duration only). Globs over the path (`/api/**`) or the full URL (`https://api.example.com/**`). Requests an adapter detects are always listed. |
| `exclude`           | `[]`                                       | Never list these, even with debug data. Same syntax. |
| `adapterOrder`      | `['debugbar', 'clockwork', 'server-timing']` | When several adapters detect the same response, the first wins. Debugbar's Clockwork emulation sends both ids; the native Debugbar reader comes first because it is complete and Octane-safe. |
| `maxRequests`       | `200`                                      | Requests kept in memory, oldest dropped first. |
| `prefetch.enabled`  | `true`                                     | Load records in the background, so the list can show query counts and issues without opening each request. |
| `prefetch.concurrency` | `2`                                     | Parallel record fetches. |
| `retryDelays`       | `[0, 100, 300, 1000]`                      | Backoff between record fetch attempts (ms). Only a 404 is retried: the server may persist a record after responding. |
| `slowQueryMs`       | `100`                                      | Queries at or above this duration are flagged as slow. |
| `nPlusOneThreshold` | `3`                                        | Minimum repetitions of one statement shape from one call site to count as N+1. |

## SQL display

| Option          | Default  | Description |
|-----------------|----------|-------------|
| `sql.highlight` | `true`   | Syntax highlighting. |
| `sql.format`    | `false`  | Lay SQL out over several lines with sql-formatter, loaded only when this is on. Statements that do not parse are shown as they are. |
| `sql.dialect`   | `'sql'`  | sql-formatter language: `sql`, `postgresql`, `mysql`, `mariadb`, `sqlite`, `tsql`, `bigquery`, … |

## Surfaces

| Option               | Default              | Description |
|----------------------|----------------------|-------------|
| `toolbar.enabled`    | `true`               | The in-page badge and panel. |
| `toolbar.position`   | `'bottom-right'`     | `bottom-right`, `bottom-left`, `top-right` or `top-left`. |
| `toolbar.open`       | `false`              | Open the panel on load. |
| `devtools.enabled`   | `true`               | The Nuxt DevTools tab (`nuxt dev` only). |
| `devtools.route`     | `'/__backend-lens/'` | Dev-server route of the tab's page. |
| `devtools.icon`      | `'carbon:data-base'` | Any [Iconify](https://icones.js.org) icon. |
| `vueDevtools.enabled`| `true`               | The Vue DevTools timeline layer (`nuxt dev` only). |
| `vueDevtools.color`  | `0x2563EB`           | Layer colour, `0xRRGGBB`. |

## Actions

| Option             | Default                          | Description |
|--------------------|----------------------------------|-------------|
| `actions.enabled`  | `true`                           | Link requests to the user action that triggered them. |
| `actions.events`   | `['click', 'submit', 'change']`  | DOM events treated as actions (listened to on `document`, capture phase). |
| `actions.windowMs` | `1000`                           | A request belongs to the latest action at most this long before it started. |

In markup, `data-backend-lens-action="…"` gives an element an explicit action label, and
`data-backend-lens-ignore` excludes an element and its subtree.

## Adapters

### `adapters.clockwork`

| Option             | Default                       | Description |
|--------------------|-------------------------------|-------------|
| `enabled`          | `true`                        | |
| `idHeader`         | `'x-clockwork-id'`            | Response header with the record id. |
| `pathHeader`       | `'x-clockwork-path'`          | Response header with the record directory, absolute or relative to the server root. Clockwork sends it when installed under a sub-path; Debugbar's emulation always sends it. |
| `endpoint`         | `'/__clockwork/'`             | Record directory when the response has no path header. |
| `webUi`            | `'/clockwork/app'`            | "Open in clockwork" link; `{id}` is replaced with the record id; `false` hides it. |
| `ignoreStatements` | `['Connection Established']`  | Statements dropped as not being queries (Debugbar's emulation reports the DB connect this way). |

### `adapters.debugbar`

| Option           | Default                  | Description |
|------------------|--------------------------|-------------|
| `enabled`        | `true`                   | |
| `idHeader`       | `'phpdebugbar-id'`       | Response header with the php-debugbar request id. |
| `prefix`         | `'/_debugbar'`           | `debugbar.route_prefix`. |
| `openPath`       | `'open?op=get&id={id}'`  | Open-handler path under the prefix; `{id}` is replaced with the URL-encoded id. |
| `ignoreKeys`     | `['clockwork']`          | Record keys dropped before parsing. `clockwork` holds the emulation's collector, which carries another request's data under Octane. |
| `statementTypes` | `['query']`              | Statement types kept as queries; Debugbar also records connection and transaction events. |

### `adapters.serverTiming`

| Option            | Default                       | Description |
|-------------------|-------------------------------|-------------|
| `enabled`         | `true`                        | Timing-only fallback for responses with a readable `Server-Timing` header and no other debug id. |
| `header`          | `'server-timing'`             | Header to read. Cross-origin it must be listed in `Access-Control-Expose-Headers`. |
| `databaseMetrics` | `['db', 'database', 'sql']`   | Metric names summed as database time. |
| `totalMetrics`    | `['total', 'app']`            | Metric names taken as the server time; the first match wins. |
