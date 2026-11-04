# nuxt-laravel-devtools

Workspace of [`nuxt-backend-lens`](packages/nuxt-backend-lens): a Debugbar-like panel for Nuxt SPAs.
It shows the SQL, logs, cache and timing behind every backend request, with data from Clockwork or
Laravel Debugbar. It also holds the demo stand the module is developed and tested against.

```
packages/nuxt-backend-lens/   the module (npm package) + playground (no PHP needed)
demo/                         Laravel 13 + Octane (FrankenPHP) + PostgreSQL, Nuxt 4 SPA, Caddy
tests/leak/                   request-isolation test for long-lived workers
tests/e2e/                    Playwright against the demo stand
tests/package/                packaged-consumption check (pack → install → production build)
docs/upstream/                drafts of issues found in third-party packages
```

## Demo stand

Requirements: Docker with Compose, Node 24, pnpm.

```bash
demo/bin/setup                     # .env files, app key, composer + pnpm install, module stub build
(cd demo && docker compose up -d)  # Octane + Clockwork by default
demo/bin/wait                      # until everything answers
```

| URL                                   | What                                                       |
|---------------------------------------|------------------------------------------------------------|
| http://localhost:18080                | the SPA, same-origin with `/api`, `/__clockwork`, `/_debugbar` |
| http://localhost:18081/cross-origin   | the SPA calling the API on another origin (CORS setup)     |
| http://localhost:18000                | the backend directly                                       |
| http://localhost:18080/clockwork/app  | Clockwork's own UI                                         |

Demo login: `demo@example.com` / `password`. If a port is taken, change it in `demo/.env`.

Switches, also in `demo/.env` or the environment:

- `DEBUG_BACKEND=clockwork|debugbar`: which package collects the data;
- `BACKEND_MODE=octane|classic`: FrankenPHP worker mode, or a fresh bootstrap per request;
- `CLOCKWORK_STORAGE=files|sql`: where Clockwork stores its records.

Example: `DEBUG_BACKEND=debugbar docker compose up -d --force-recreate backend`.

## Checks

```bash
pnpm -F nuxt-backend-lens lint && pnpm -F nuxt-backend-lens test:types && pnpm -F nuxt-backend-lens test
(cd demo && docker compose run --rm backend-tests)   # PHPUnit
pnpm test:leak --source=clockwork                     # or --source=debugbar
pnpm test:e2e                                         # against the running stand
pnpm test:package                                     # packed module in a clean app
```

`.github/workflows/ci.yml` runs all of them, and runs the stand once per `DEBUG_BACKEND`.
