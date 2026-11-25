# Changelog


## v0.1.2

[compare changes](https://github.com/DmitrySkibitsky/nuxt-backend-lens/compare/v0.1.1...v0.1.2)

### 🚀 Enhancements

- **ui:** Open timeline queries as highlighted statements ([fd30c91](https://github.com/DmitrySkibitsky/nuxt-backend-lens/commit/fd30c91))
  - A query bar on the **Timeline** tab opens the query below it, as in an N+1 or duplicate group on the Queries tab: highlighted SQL, duration, call site and bindings.
  - The bar labels are highlighted too.
- **ui:** Search requests and their records ([a9f99b4](https://github.com/DmitrySkibitsky/nuxt-backend-lens/commit/a9f99b4))
  - A search field across the panel filters the request list. Requests whose method, path or status match come first; requests that match only inside their record follow under "Found inside requests", with what matched: SQL and bindings, log messages, cache keys, exceptions, the controller, timeline events.
  - Records not loaded yet are not searched. Escape or the ✕ button clears the search. See [The panel](https://github.com/DmitrySkibitsky/nuxt-backend-lens/blob/main/docs/features.md#the-panel).

### ❤️ Contributors

- Dmitry Skibitsky ([@DmitrySkibitsky](https://github.com/DmitrySkibitsky))

## v0.1.1

[compare changes](https://github.com/DmitrySkibitsky/nuxt-backend-lens/compare/v0.1.0...v0.1.1)

### 🚀 Enhancements

- Open source paths in an editor ([777e4ab](https://github.com/DmitrySkibitsky/nuxt-backend-lens/commit/777e4ab))
  - A **Settings** screen in the panel chooses the editor: VS Code, PhpStorm, Zed or a custom binary. Off by default and kept per browser.
  - The controller, query call sites, the origin of N+1 and duplicate groups, exceptions, log sources and cache sources become links. A known line opens there; an unknown one (a controller found by its class name) opens at line 1.
  - Files open through the editor's URL handler, which works with a dev server in a container, or through a command the Nuxt dev server runs, for editors without a handler or at a custom path (NixOS, macOS bundles, Windows `.exe` and `.cmd`).
  - Paths reported by a backend in a container map to a local project root. The adapters find the backend's root in the record.
  - New options: `editor.presets`, `editor.namespaces` (PSR-4 prefixes for controller classes), `editor.launcher`, `editor.route`, `editor.allowedHosts`. See [Opening files in an editor](https://github.com/DmitrySkibitsky/nuxt-backend-lens/blob/main/docs/features.md#opening-files-in-an-editor).

### 🩹 Fixes

- **ui:** Keep the hovered toolbar badge opaque ([6e653e4](https://github.com/DmitrySkibitsky/nuxt-backend-lens/commit/6e653e4))

### ❤️ Contributors

- Dmitry Skibitsky ([@DmitrySkibitsky](https://github.com/DmitrySkibitsky))

## v0.1.0


### 🚀 Enhancements

- **module:** Add the toolbar with Clockwork and Laravel Debugbar adapters ([0231c75](https://github.com/DmitrySkibitsky/nuxt-backend-lens/commit/0231c75))
- **module:** Add query analysis, DevTools tab and packaged/cross-origin checks ([c01669c](https://github.com/DmitrySkibitsky/nuxt-backend-lens/commit/c01669c))
- **module:** Add the Server-Timing adapter, UI actions, the Vue DevTools timeline, SQL highlighting and formatting, the DevTools theme ([82ecb57](https://github.com/DmitrySkibitsky/nuxt-backend-lens/commit/82ecb57))
- **ui:** Resizable toolbar panel and list/details splitter ([ce0829c](https://github.com/DmitrySkibitsky/nuxt-backend-lens/commit/ce0829c))
- **ui:** Toggle issue groups from the issues summary ([3e3797a](https://github.com/DmitrySkibitsky/nuxt-backend-lens/commit/3e3797a))
- **module:** Warn when a production build ships the lens by default ([cd3b633](https://github.com/DmitrySkibitsky/nuxt-backend-lens/commit/cd3b633))

### 🩹 Fixes

- **core:** Keep record URLs from response headers on the response origin ([e5463e1](https://github.com/DmitrySkibitsky/nuxt-backend-lens/commit/e5463e1))
- **core:** Stop a replaced lens for good, honour enabled at runtime ([41a482c](https://github.com/DmitrySkibitsky/nuxt-backend-lens/commit/41a482c))
- **core:** Validate options, fall back to defaults on invalid values ([d57ee75](https://github.com/DmitrySkibitsky/nuxt-backend-lens/commit/d57ee75))
- **core:** Retry only what can succeed, time out record fetches ([cdf6361](https://github.com/DmitrySkibitsky/nuxt-backend-lens/commit/cdf6361))
- **core:** Small robustness fixes from the audit ([adf7fab](https://github.com/DmitrySkibitsky/nuxt-backend-lens/commit/adf7fab))
- **ui:** Accessible list and tabs, slow queries in groups, safer classes ([ca66616](https://github.com/DmitrySkibitsky/nuxt-backend-lens/commit/ca66616))

### ❤️ Contributors

- Dmitry Skibitsky ([@DmitrySkibitsky](https://github.com/DmitrySkibitsky))

