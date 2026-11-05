# Development

## Workspace

```
packages/nuxt-backend-lens/   the module (npm package)
  playground/                 Nuxt app replaying captured records, no PHP needed
  test/unit/                  vitest; adapter tests run against captured records
  test/fixtures/records/      records captured from the demo stand (redacted)
  scripts/capture-fixtures.mjs
demo/
  backend/                    Laravel 13 + Octane (FrankenPHP) + Clockwork / Debugbar, PostgreSQL
  frontend/                   Nuxt 4 SPA (ssr: false) + nuxt-auth-sanctum; loads the module from source
  proxy/Caddyfile             same-origin entry (DEMO_PORT) and cross-origin entry (CROSS_ORIGIN_PORT)
  docker/                     backend image and entrypoint
  bin/                        setup, wait, check-stand, devtools-auth
tests/
  leak/                       request isolation under long-lived workers
  e2e/                        Playwright against the demo stand
  package/                    packaged-consumption check
scripts/record-demo.mjs       records docs/assets/demo.gif on the stand
```

pnpm workspace with pnpm pinned in `package.json` (`packageManager`); `corepack enable` provides it.

## Tools

| Tool                  | Why                                                   |
|-----------------------|-------------------------------------------------------|
| Docker + Compose      | the demo stand                                        |
| Node 24, pnpm 12      | the workspace                                         |
| make                  | shortcuts (optional; every target is a plain command) |
| Composer (optional)   | `make setup` prefers the host's; otherwise it runs in the backend image |

**Nix**: `nix develop` (or direnv with `use flake`) provides all of it except Docker, which is a
system service (`virtualisation.docker.enable` on NixOS):
- Node 24 with pnpm 12.9 through corepack;
- PHP 8.5 and Composer;
- make;
- a Chromium for Playwright, with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` set.

The shell also unsets `LD_LIBRARY_PATH`, which breaks Chromium on NixOS when it points at other glibc
builds.

## Demo stand

```bash
make setup                     # .env files, app key, composer + pnpm install, module stub build
make up                        # Octane + Clockwork by default
make restart BACKEND=debugbar  # switch the debug package (or MODE=classic for per-request bootstrap)
make logs s=backend
make down
```

Ports are configurable in `demo/.env` (`DEMO_PORT` 18080, `BACKEND_PORT` 18000,
`CROSS_ORIGIN_PORT` 18081), all bound to `127.0.0.1`.

Scenario pages and the endpoints behind them:

| Page            | Endpoint                         | Shows                                            |
|-----------------|----------------------------------|--------------------------------------------------|
| `/books`        | `GET /api/books[?eager=1]`       | N+1 (31 queries) vs eager loading (2)            |
| `/stats`        | `GET /api/stats`                 | duplicate count queries                          |
| `/slow`         | `GET /api/slow`                  | a ~300 ms query                                  |
| `/cached`       | `GET /api/cached[?fresh=1]`      | cache miss + write, then hit                     |
| `/logs`         | `GET /api/logs`                  | log levels                                       |
| `/boom`         | `GET /api/boom`                  | a 500 with an exception                          |
| `/reviews`      | `POST /api/books/{id}/reviews`   | Sanctum login, insert, event, queued job         |
| `/clients`      | `GET /api/stats` ×6              | six HTTP clients                                 |
| `/everything`   | all of the above                 | parallel requests in one navigation              |
| `/cross-origin` | `BACKEND_PORT` directly          | the CORS setup (open it on `CROSS_ORIGIN_PORT`)  |
| `/timing-only`  | `GET /api/timing-only`           | the Server-Timing fallback (excluded from both packages) |

Demo login: `demo@example.com` / `password`.

## Module development

```bash
make dev        # playground on :3000; replays test/fixtures/records through both wire formats
make module     # lint + vue-tsc + vitest
```

Formatting and lint for the whole workspace (module, playground, demo frontend, tests, scripts):
one root `eslint.config.mjs` (ESLint Stylistic for TS / JS / Vue, `eslint-plugin-jsonc` for JSON)
and one root `stylelint.config.mjs` for CSS. PHP is formatted by Pint.

```bash
make format         # fix in place
make format-check   # check, as CI does
make pint           # PHP (make pint-check: check only)
```

**Git hooks** (`simple-git-hooks`, installed by `pnpm install`):

| Hook       | Runs                                                                                  |
|------------|---------------------------------------------------------------------------------------|
| pre-commit | `lint-staged` on the staged files: ESLint and Stylelint with `--fix`, Pint (host PHP when available, else the backend image). Fixes are staged; an error that cannot be fixed stops the commit |
| pre-push   | `pnpm check:push`: workspace lint, module types and unit tests (about 15 s)            |

Hooks can be bypassed (`git commit --no-verify`, `SKIP_SIMPLE_GIT_HOOKS=1`), so CI stays the
gate. After changing the `simple-git-hooks` section of `package.json`, run `pnpm prepare` to
reinstall them.

The demo frontend loads the module from source (`../../packages/nuxt-backend-lens/src/module`), so
runtime changes reach it by HMR. The packaged path is covered by `make package`.

Refresh the fixtures from a running stand:

```bash
node packages/nuxt-backend-lens/scripts/capture-fixtures.mjs --source=clockwork
make restart BACKEND=debugbar
node packages/nuxt-backend-lens/scripts/capture-fixtures.mjs --source=debugbar
```

Re-record the demo GIF (`docs/assets/demo.gif`, shown in the READMEs) after a visible UI change:

```bash
make demo-gif   # running stand on Clockwork, ffmpeg and a Chromium (both in nix develop)
```

The tour is scripted in `scripts/record-demo.mjs`; frames come from Chromium's screencast.

## Tests

| Command                         | What                                                                  |
|---------------------------------|-----------------------------------------------------------------------|
| `make unit`                     | ~100 vitest tests: adapters on real records, analysis, interceptor, collector, SQL, actions, timeline, colour mode |
| `make backend-test`             | PHPUnit for the demo backend (clean env, in the image)                |
| `make leak`                     | concurrent marker requests plus noise; every record must hold only its own marker query, log entry and UUID |
| `make e2e`                      | Playwright against the running stand (debug-package-specific tests skip themselves) |
| `make package`                  | pack, install into a clean app outside the workspace, production build with the module on (browser check) and off (no code in the bundle) |
| `make stand MODE=… BACKEND=…`   | one CI stand configuration: restart, wait, leak test, e2e             |
| `make check`                    | everything CI runs                                                    |

## CI

Changes go through a branch and a pull request. Two rulesets protect `main`:

- **main**: no direct pushes, no force pushes, no deletion, linear history, and a pull request is
  merged only when the **CI result** check passed. Nobody can bypass it, the owner included.
- **main: only the owner merges**: nobody may update `main` except the repository admin (the
  owner), and only through a pull request. Collaborators can open pull requests but cannot merge
  them.
`.github/workflows/ci.yml` runs on every pull request and again on `main` after the merge.

A `changes` job looks at the changed files first. When they are all documentation (`docs/**`,
`*.md`, `LICENSE`), the jobs below are skipped and **CI result** still passes. The filter lives
inside the workflow on purpose: a workflow that does not start would leave the required check
pending. A rename counts with both paths, so moving code under `docs/` still runs everything.

- Jobs get a read-only token, and checkouts do not keep it.
- Actions are pinned to commit SHAs; Dependabot (`.github/dependabot.yml`) proposes updates weekly.
- A newer push to a pull request cancels its older run; every commit on `main` gets its own run.
- A pull request runs its **own** `ci.yml`, so a change to the workflow can make **CI result** pass
  on anything. Read workflow changes before merging.

| Job       | Steps |
|-----------|-------|
| `changes` | decides whether the change is documentation only |
| `module`  | workspace lint and formatting, module types, unit |
| `package` | packaged consumption |
| `result`  | **CI result**, the required check: every job passed or was skipped |
| `stand`   | matrix `{octane, clockwork}`, `{octane, debugbar}`, `{classic, clockwork}`: `demo/bin/setup`, Pint (once), PHPUnit, stand up, leak test, e2e; logs and Playwright traces on failure |

On CI, Playwright retries a failed test once (a cold dev server may reload while Vite pre-bundles)
and reports it as flaky.
