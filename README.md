# nuxt-backend-lens

Workspace of [`nuxt-backend-lens`](packages/nuxt-backend-lens): a Debugbar-like panel for Nuxt SPAs.
It shows the SQL, logs, cache and timing behind every backend request, with data from Clockwork or
Laravel Debugbar. It also holds the demo stand the module is developed and tested against.

```
packages/nuxt-backend-lens/   the module (npm package) + playground (no PHP needed)
demo/                         Laravel 13 + Octane (FrankenPHP) + PostgreSQL, Nuxt 4 SPA, Caddy
tests/leak/                   request-isolation test for long-lived workers
tests/e2e/                    Playwright against the demo stand
tests/package/                packaged-consumption check (pack → install → production build)
docs/                         documentation: getting started, features, configuration, adapters, …
docs/upstream/                drafts of issues found in third-party packages
```

## Demo stand

Requirements: Docker with Compose, Node 24, pnpm 12 (pinned through `packageManager`, so
`corepack enable` gives the right one), make.

On Nix, `nix develop` (or direnv with `use flake`) provides everything except Docker: Node 24 with
the pinned pnpm, PHP 8.5 + Composer, make, and a Chromium for Playwright. It also unsets
`LD_LIBRARY_PATH`, which breaks Chromium on NixOS when it points at other glibc builds. Docker
itself is a system service (`virtualisation.docker.enable` on NixOS).

```bash
make setup     # .env files, app key, composer + pnpm install, module stub build
make up        # Octane + Clockwork by default; waits until everything answers
make help      # every shortcut
```

| URL                                   | What                                                       |
|---------------------------------------|------------------------------------------------------------|
| http://localhost:18080                | the SPA, same-origin with `/api`, `/__clockwork`, `/_debugbar` |
| http://localhost:18081/cross-origin   | the SPA calling the API on another origin (CORS setup)     |
| http://localhost:18000                | the backend directly                                       |
| http://localhost:18080/clockwork/app  | Clockwork's own UI                                         |

Demo login: `demo@example.com` / `password`. If a port is taken, change it in `demo/.env`.

Nuxt DevTools asks a browser for authorization once and prints the instructions to the dev
server's terminal. On this stand that terminal is the frontend container's log. Run
`make devtools-auth` and open the link it prints. The token lives in `demo/.state/`, so the
authorization survives container re-creation.

Switches (`MODE=` / `BACKEND=` on make targets, or `BACKEND_MODE` / `DEBUG_BACKEND` in `demo/.env`):

- `BACKEND=clockwork|debugbar`: which package collects the data;
- `MODE=octane|classic`: FrankenPHP worker mode, or a fresh bootstrap per request;
- `CLOCKWORK_STORAGE=files|sql` (in `demo/.env`): where Clockwork stores its records.

Example: `make restart BACKEND=debugbar`.

## Checks

| Command                              | What                                                        |
|--------------------------------------|-------------------------------------------------------------|
| `make module`                        | lint, types and unit tests of the module                    |
| `make backend-test`                  | PHPUnit, in the backend image                               |
| `make leak`                          | worker-isolation test against the running stand             |
| `make e2e`                           | Playwright against the running stand                        |
| `make package`                       | packed module in a clean app, production build on and off   |
| `make stand MODE=… BACKEND=…`        | one CI stand configuration: restart, wait, leak test, e2e   |
| `make check`                         | everything CI runs, all three stand configurations          |

Every target is a thin alias over a script (`pnpm …`, `demo/bin/*`, `docker compose`), so all of
them also work without make. `.github/workflows/ci.yml` runs the same checks: the module job, the
package check, and the stand as a matrix `{octane, clockwork}`, `{octane, debugbar}`,
`{classic, clockwork}`.
