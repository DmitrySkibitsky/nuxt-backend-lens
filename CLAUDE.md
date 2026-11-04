# nuxt-backend-lens — notes for AI agents

A Nuxt module (`packages/nuxt-backend-lens`) plus the demo stand it is tested against. Layout,
commands and the stand: `docs/development.md` and `make help`. Known problems:
`docs/troubleshooting.md`. The PHP app has its own `demo/backend/CLAUDE.md` (Laravel Boost).

## Ground rules

- **Self-contained.** Tests, spikes and checks run on the apps in `demo/`, never on a third-party
  or work codebase.
- **No hardcoding.** Every vendor-specific string (header, path, metric name) is a module option
  with a default in `src/runtime/core/options.ts`. Only adapters know a vendor format. Ports come
  from `demo/.env`.
- **One UI, several shells** (toolbar, DevTools tab). Do not fork `src/runtime/ui/` per shell; pass
  differences in (`embedded`, colour mode).
- **The core (`src/runtime/core/`) imports no Vue**: the DevTools iframe, another realm with another
  Vue, subscribes to the app's store.
- Parsing changes need unit tests on real captured records (`test/fixtures/records`, refreshed by
  `scripts/capture-fixtures.mjs`, which redacts `APP_KEY`). UI or wire changes need an e2e test.

**Done means**: `make format-check`, `make module`, `make e2e` on the running stand; plus
`make stand-all` when the wire or the backend changes, `make package` when module setup or
dependencies change. Changing `module.ts` needs `docker compose restart frontend` first.
A dependency change also needs a clean install (`CI=1 pnpm install --frozen-lockfile` in a fresh
`git worktree`): pnpm fails on a dependency build script that `allowBuilds` neither allows nor
denies, and an existing `node_modules` hides it.
Git hooks run lint-staged on commit and `pnpm check:push` on push: never bypass them with
`--no-verify`; fix the cause.

## Testing conventions

- Never assert absolute query counts in e2e: the Sanctum session adds its own. Count by statement
  (`from "authors"`) or read the Queries tab label.
- Playwright `filter({ has })` resolves the inner locator inside each candidate: build it from
  `page`.
- Query rows nest group members; count by own SQL:
  `[data-testid="backend-lens-query"] > [data-testid="backend-lens-sql"]`.
- Debug-package-specific e2e tests skip themselves through `DEBUG_BACKEND`.
- "Vite discovered new dependencies at runtime" in the frontend log is a bug: pre-bundle it
  (module: `CLIENT_DEPENDENCIES`; demo: `vite.optimizeDeps.include`).
- `happy-dom` replaces the global `URL`: build fixture paths with `node:path`.

## Architecture facts

- The interceptor reads headers only, loads records with the **original** fetch, and its fetch/XHR
  patches are idempotent across HMR.
- `Server-Timing` comes from a `PerformanceObserver`: the 250-entry resource timing buffer
  overflows in `nuxt dev`.
- Options merge with array replacement (`mergeOptions`) and are resolved again in the browser
  (`resolveOptions`): runtime config may be partial or stale.
- Adapters are pure (`detect` → `RecordRef | null`, `parse` → `DebugDetails`); `RecordRef.inline`
  skips the fetch; registry order breaks ties. N+1 and duplicate groups are disjoint.
- The DevTools tab finds the lens via the string key `window.__BACKEND_LENS__` (Symbols are per
  realm).
- devtools-kit drops timeline events while no client is connected and may run setup twice: the
  emitter gates on `highPerfModeEnabled`, the setup is idempotent.
- Resolve dependencies like Vite (exsolve). `require.resolve` follows `NODE_PATH`, which pnpm's
  shims point at the whole store.
- Debugbar's Clockwork emulation leaks data between requests under Octane: use its native format.

## Comments

- A comment says **why**: a constraint, a workaround, a non-obvious invariant, a link to a bug or
  spec. If the name and the type already say it, write no comment.
- No history: no "stage N", "previously", "now", "fixed", "new". Git keeps history.
- One explanation, one place. Design lives in `docs/architecture.md`; code points there in a line
  instead of repeating it. A decision is explained where it is made (e.g. the shell that picks the
  colour mode), not in every file it touches.
- File headers: one to three lines, only when the file's role is not obvious from its name.
- Public API and module options keep their JSDoc (users see it in the IDE), with units.
- Tests: the test name says what is checked. Comment only non-obvious setup or why an assertion is
  loose.
- A change that makes a comment wrong updates or deletes it in the same commit.
- PHP: the Boost rules in `demo/backend/CLAUDE.md` (PHPDoc over inline comments).

## Lint and format

One root `eslint.config.mjs` and one `stylelint.config.mjs`; no per-package configs. TypeScript is
enabled explicitly (auto-detection only checks the root), and `eslint-plugin-jsonc` presets are
scoped to JSON files. Formatting-only changes go in their own `style:` commit.
