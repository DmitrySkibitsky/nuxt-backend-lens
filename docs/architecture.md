# Architecture

```
            app window                                             backend
┌──────────────────────────────────────────────┐
│ plugin.client (enforce: 'pre')               │      request ──────────▶  Laravel / any
│   interceptor: fetch + XHR ───── response ◀──┼──── headers: X-Clockwork-Id, phpdebugbar-id,
│        │                                     │                Server-Timing
│        ▼                                     │
│   adapter registry ── detect ──▶ RecordRef   │
│        │                                     │
│        ▼                                     │      record fetch (original fetch) ──▶ /__clockwork/{id}
│   collector ── load / prefetch / retry ──────┼──────────────────────────────────────▶ /_debugbar/open
│        │        parse ──▶ DebugDetails       │
│        ▼                                     │
│   store (framework-free) ◀── actions, navigations, Server-Timing (PerformanceObserver)
│        │                                     │
│   ┌────┴──────────────┬──────────────────────┼──────────────┐
│   ▼                   ▼                      │              ▼
│ toolbar shell     vue-devtools shell         │   window.__BACKEND_LENS__
│ (Shadow DOM)      (timeline layer)           │              │
└──────────────────────────────────────────────┘              │
                                    Nuxt DevTools tab iframe ─┘  devtools shell (same UI, embedded)
```

## Layers

| Path (under `src/runtime/`) | Role | Depends on Vue |
|-----------------------------|------|----------------|
| `core/` | types, options, adapters, registry, interceptor, Server-Timing, store, collector, analysis, actions, timeline mapping | no |
| `ui/` | the panel's Vue components, SQL tokenizer, colour mode | yes |
| `shells/toolbar.ts` | mounts the UI as its own Vue app in a Shadow DOM on the page | yes |
| `shells/devtools.ts` | mounts the same UI, embedded, in the Nuxt DevTools tab | yes |
| `shells/vue-devtools.ts` | forwards timeline events to devtools-kit | no (devtools API) |
| `plugin.client.ts` | creates the lens, wires router navigations, mounts the shells | Nuxt |
| `module.ts`, `devtools.ts` | options, plugin, auto-imports, the DevTools tab page, Vite pre-bundling | Nuxt kit |

One UI, three shells. A feature built in `ui/` shows up in the toolbar and in the DevTools tab;
a feature in `core/` is available to every shell.

## Decisions

**Patch `fetch` and `XMLHttpRequest`, not ofetch hooks.**
- Only the lowest level sees every client: axios, raw `fetch`, nuxt-auth-sanctum's own `$fetch`
  instance.
- The plugin runs with `enforce: 'pre'`, so requests fired during other plugins' setup are
  captured too.
- Response bodies are never read.
- The patches are idempotent across HMR, and `restore()` undoes only the module's own patches.

**Records are loaded with the original `fetch`.** The lens's own requests never show up as app
traffic.

**Framework-free store.**
- Entries are replaced, never mutated in place, so a `shallowRef` UI sees every change.
- Because the store holds no Vue reactivity, Vue running in **another realm** can subscribe to it
  directly. That realm is the DevTools tab iframe, which has its own Vue instance.
- The tab finds the lens through `window.__BACKEND_LENS__`. It is a string key on purpose: Symbols
  are per realm.

**Server-Timing through a `PerformanceObserver`, never `performance.getEntriesByType()`.**
- In `nuxt dev`, Vite loads hundreds of modules and the resource timing buffer (250 entries by
  default) fills up, so later entries never reach it.
- Entries also arrive after `fetch()` has resolved, so they are matched to requests by URL and
  start time.

**Shadow DOM for the toolbar.**
- CSS isolation in both directions.
- The styles are imported as a string (`?inline`) and injected into the shadow root.
- The toolbar is a separate `createApp()`, lazy-loaded after `app:mounted`.

**Options are resolved twice.**
- The module merges user options over the defaults at build time. Arrays replace instead of being
  concatenated, unlike Nuxt's own `defaults` merge.
- The browser re-applies the defaults to the runtime config it receives. `NUXT_PUBLIC_*` overrides
  can be partial, and a dev server started with an older module version used to crash the plugin
  on new option keys.

**Vite pre-bundling of lazy client dependencies.** `sql-formatter` and the Vue DevTools API are
imported dynamically. Vite would discover them only at runtime and reload the page, so the module
adds them to `optimizeDeps.include`:
- installed as a package, they are nested specifiers (`nuxt-backend-lens > sql-formatter`);
- loaded from source, the plain name is used only if the app itself resolves it.

Resolution is ESM-style (exsolve), like Vite's, because pnpm's bin shims set `NODE_PATH` to the
whole store, which would make `require.resolve` find everything.

**Vue DevTools timeline.** devtools-kit (8.x):
- drops timeline events while no client is connected (high-performance mode);
- runs a plugin's setup either at once or only on connect, and sometimes twice.

So the emitter marks an event as sent only when devtools-kit accepts it, catches up on connect, and
its setup is idempotent: no loss, no duplicates.

**Issue detection in the browser.** It works the same for every adapter, and it needs nothing from
the backend beyond what the debug package already records.

## Wire formats and Octane

Two collectors are supported because they differ in Octane safety. Verified with a dedicated
concurrent leak test (`tests/leak/`):

| Collector | Wire format                  | Octane (FrankenPHP worker mode) |
|-----------|------------------------------|---------------------------------|
| Clockwork | Clockwork protocol           | isolated per request            |
| Debugbar  | php-debugbar native          | isolated per request            |
| Debugbar  | its Clockwork emulation      | **leaks the first request's data into later records** |

The native Debugbar adapter also drops the record's `clockwork` key, which carries that stale
collector.
