# Troubleshooting

## No badge on the page

- Is the module enabled for this build? Under `$development` it is absent from `nuxt build`
  output; with `enabled: process.env.BACKEND_LENS === '1'` the variable must be set **at build
  time**.
- Check the browser console for `[backend-lens]` warnings.

## Requests are listed, but say "no debug data"

The response carries no id that an adapter recognizes.

- **Clockwork**: is `CLOCKWORK_ENABLE=true` set? With `null`, Clockwork runs only for requests to a
  local host. Docker, proxies and staging domains are not local.
- **Debugbar**: is it enabled (`DEBUGBAR_ENABLED`) for this environment? It turns itself off when
  `APP_DEBUG` is false.
- **Cross-origin API**: the headers exist but the browser hides them. Add them to
  `Access-Control-Expose-Headers` ([Getting started](getting-started.md#cross-origin)).
- Requests only appear at all when an adapter detects them or they match `include`.

## "Record …: HTTP 404" or 403 in the details

- **Debugbar**: the open handler refuses non-local requests unless `DEBUGBAR_OPEN_STORAGE=true`.
- **Clockwork** behind a proxy: is `/__clockwork/*` proxied like `/api`?
- **Cross-origin**: the record paths (`__clockwork/*`, `_debugbar/*`) need CORS too, with
  credentials.
- **A 404 right after the response is retried** (`retryDelays`) because records may be written after
  the response is sent. A lasting 404 usually means the record expired (`storage_expiration`).

## Debugbar under Octane: wrong URIs or headers in records

You enabled `DEBUGBAR_CLOCKWORK=true`. Under Octane its Clockwork collector keeps the worker's
first request and reports it in every later record. Turn the emulation off; the module reads
Debugbar's native format, which is safe.

## Database time shows, but no queries

The record came from the **Server-Timing** fallback (the details say "Timing only"): the response
had no Clockwork or Debugbar id. Install one of the packages for query-level data.

## Server-Timing is missing for a cross-origin API

Browsers hide `serverTiming` of cross-origin responses unless the response carries
`Timing-Allow-Origin` naming the page's origin.

## Nuxt DevTools keeps asking for authorization

Nuxt DevTools asks each browser once ("Permissions required") and prints a link with a token to
the dev server's **terminal**. When the dev server runs in a container, that terminal is the
container log, and the token lives in the container: re-creating the container invalidates it.

- Demo stand: `make devtools-auth` prints the link. The token is persisted in `demo/.state/`.
- Your own setup: persist `$XDG_CONFIG_HOME/.nuxt/devtools/` (or `~/.nuxt/devtools/`) of the dev
  server, for example with a bind mount.

## The Backend Lens tab is not in Nuxt DevTools

- It exists only in `nuxt dev`, with DevTools enabled and `devtools.enabled` left on.
- Nuxt DevTools lists module tabs under "⋮" in its sidebar, and shows them only once the browser is
  authorized (see above).

## Nothing on the Vue DevTools timeline

Vue DevTools keeps plugin layers switched off. Enable **Backend requests** in its Timeline.
Requests made before it connected are delivered on connect.

## Chromium does not start (NixOS)

A global `LD_LIBRARY_PATH` pointing at other glibc builds breaks Chromium. Use `nix develop`,
which unsets it and provides a working Chromium, or run with `env -u LD_LIBRARY_PATH`. Playwright's
own browser downloads do not run on NixOS; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## The page reloads once when the panel is first opened (dev)

Vite discovered a dependency at runtime. The module pre-bundles its lazy client dependencies when
it is installed as a package. When it is loaded from source in a workspace, the app may not
resolve them and Vite finds them on first use; after that they stay cached.
