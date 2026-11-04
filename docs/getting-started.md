# Getting started

Three parts: a debug package on the backend, a way for the browser to reach its data, and the Nuxt
module.

## 1. Backend

Pick **one** source. All of them are development tools; keep them out of production.

### Clockwork

```bash
composer require --dev itsgoingd/clockwork
```

```dotenv
CLOCKWORK_ENABLE=true
```

- **Set `CLOCKWORK_ENABLE` explicitly.** With the default `null`, Clockwork only turns on for
  requests whose host is local. Behind Docker, a proxy or a staging domain, that is not the case.
- **Storage**: files (default), a separate SQLite file (`CLOCKWORK_STORAGE=sql`) or Redis. Never the
  application database.
- **Retention**: keep `CLOCKWORK_STORAGE_EXPIRATION` short.
- Works under **Laravel Octane**: verified with concurrent load on FrankenPHP worker mode.

### Laravel Debugbar

```bash
composer require --dev fruitcake/laravel-debugbar
```

```dotenv
DEBUGBAR_ENABLED=true
DEBUGBAR_OPEN_STORAGE=true
```

- `DEBUGBAR_OPEN_STORAGE=true` lets the open handler (`/_debugbar/open`) answer requests that do not
  come from localhost. The module reads Debugbar's records through it.
- **Do not enable `DEBUGBAR_CLOCKWORK` under Octane.** Debugbar's Clockwork emulation attaches the
  first request's data (URI, headers, cookies, session) to later requests of the same worker. The
  module reads Debugbar's native format, so it does not need the emulation. See the
  [draft upstream issue](upstream/laravel-debugbar-octane-clockwork.md).
- With **both** packages installed, Debugbar turns itself on whenever `APP_DEBUG=true`. Set
  `DEBUGBAR_ENABLED=false` when Clockwork is the source.

### Any other backend: Server-Timing

Without Clockwork or Debugbar, the module falls back to the response's
[`Server-Timing`](https://developer.mozilla.org/docs/Web/HTTP/Headers/Server-Timing) header.

```http
Server-Timing: db;dur=12.4;desc="Database", total;dur=48.0;desc="Total"
```

- Metrics named `db`, `database` or `sql` count as database time; `total` or `app` is the server
  time. Both lists are [configurable](configuration.md#adapters).
- The panel then shows timing only: no queries and no logs.

## 2. Let the browser reach the data

The module reads a debug header from each response and then fetches the record from the same
server. Both work out of the box when the API is **same-origin** with the SPA.

### Same origin (recommended)

Proxy the debug paths next to the API, through the SPA's origin. Example in Caddy:

```caddyfile
@backend path /api/* /sanctum/* /__clockwork/* /clockwork /clockwork/* /_debugbar/*
handle @backend {
	reverse_proxy backend:8000
}
```

The same works in nginx or Traefik, the way `/api` is already proxied.

### Cross origin

When the SPA calls an API on another origin, the browser hides the debug headers and blocks the
record requests unless the backend allows them. In Laravel, run `php artisan config:publish cors`
and set:

```php
// config/cors.php
'paths' => ['api/*', 'sanctum/csrf-cookie', '__clockwork/*', '_debugbar/*'],
'allowed_origins' => ['https://your-spa.example'],   // explicit: credentials rule out '*'
'exposed_headers' => ['X-Clockwork-Id', 'X-Clockwork-Path', 'X-Clockwork-Version', 'phpdebugbar-id'],
'supports_credentials' => true,
```

`Server-Timing` additionally needs `Timing-Allow-Origin: https://your-spa.example` on API responses.
A small middleware can add it; the demo stand has one (`demo/backend/app/Http/Middleware/TimingAllowOrigin.php`).

Record URLs are resolved against the **response's** origin, so no module option changes for a
cross-origin API.

## 3. Nuxt

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

A **Backend** badge appears in the bottom-right corner. It shows the current navigation's requests,
queries, DB time and number of issues; click it to open the panel. In `nuxt dev` the same panel is
also a **Backend Lens** tab in Nuxt DevTools, under "⋮" in its sidebar.

To also list requests without debug data (status and duration only), give their paths:

```ts
backendLens: {
  include: ['/api/**', '/sanctum/**'],
}
```

## Staging builds

The module adds code only when it is enabled at **build** time. To ship it in a staging build but
never in production, keep it in `modules` and switch it with an environment variable:

```ts
export default defineNuxtConfig({
  modules: ['nuxt-backend-lens'],
  backendLens: {
    enabled: process.env.BACKEND_LENS === '1',   // BACKEND_LENS=1 nuxt build
  },
})
```

With `enabled: false` the client bundle contains no trace of the module. The workspace's package
check verifies this on every CI run.

On a shared staging server, put the backend package's authentication or a gate in front of its
endpoints, and keep retention short.

## Security

- **Debug records contain real data**: SQL bindings, session contents, request headers.
- **Laravel Debugbar stores `APP_KEY` in clear.** Its request collector dumps the server environment
  and masks `*PASSWORD*` values, but `APP_KEY` was in clear in every record (fruitcake/laravel-debugbar
  4.4.5). Anyone who can read the records can read the key.
- **The toolbar never reads response bodies or form values.** Action labels come from markup only
  (see [Features](features.md#actions)).
