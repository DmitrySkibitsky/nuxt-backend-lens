# Contributing

The workspace, the demo stand and every command are described in
[docs/development.md](docs/development.md); `make help` lists the targets. Known problems are in
[docs/troubleshooting.md](docs/troubleshooting.md).

## Ground rules

- **Self-contained.** Tests, spikes and checks run on the apps in `demo/`, never on a third-party
  codebase.
- **No hardcoding.** Every vendor-specific string (header, path, metric name) is a module option
  with a default in `packages/nuxt-backend-lens/src/runtime/core/options.ts`. Only adapters know a
  vendor format. Ports come from `demo/.env`.
- **One UI, several shells** (toolbar, DevTools tab). `src/runtime/ui/` is not forked per shell;
  differences are passed in.
- **The core (`src/runtime/core/`) imports no Vue.** The design behind these rules is in
  [docs/architecture.md](docs/architecture.md).

## Workflow

- Every change goes through a branch and a pull request; nobody commits or pushes to `main`
  directly. Branch names follow the commit type: `feat/…`, `fix/…`, `ci/…`, `docs/…`.
- Commits and pull request titles follow [Conventional Commits](https://www.conventionalcommits.org/):
  `<type>(<scope>): <short description>`, e.g. `fix(core): keep record URLs on the response origin`.
  Formatting-only changes go in their own `style:` commit.
- One concern per pull request. Every commit should make sense on its own: pull requests are
  usually merged with **Rebase**, which keeps them; a branch with fix-up commits is squashed.
- `main` is protected: a pull request gets in only when the **CI result** check passed, and only
  the owner merges. Documentation-only changes skip the heavy jobs; CI result still reports. The
  rulesets and the CI jobs are described in [docs/development.md](docs/development.md#ci).
- Git hooks run lint-staged on commit and `pnpm check:push` on push. Never bypass them with
  `--no-verify`; fix the cause.

## Definition of done

Always, on the running stand:

- `make format-check`, `make module`, `make e2e`.

Also, depending on the change:

| Change                                   | Also run                                                       |
|------------------------------------------|----------------------------------------------------------------|
| The wire (headers, records) or the backend | `make stand-all`                                             |
| Module setup (`module.ts`) or dependencies | `make package`                                               |
| `module.ts`                              | `docker compose restart frontend` (in `demo/`) before the checks |
| Dependencies                             | a clean install: `CI=1 pnpm install --frozen-lockfile` in a fresh `git worktree` |

The clean install matters: pnpm fails on a dependency build script that `allowBuilds` neither
allows nor denies, and an existing `node_modules` hides it.

## Tests

- Parsing changes need unit tests on real captured records (`test/fixtures/records`, refreshed by
  `scripts/capture-fixtures.mjs`, which redacts `APP_KEY`).
- UI or wire changes need an e2e test (`tests/e2e`).
- A test for a bug should fail without the fix; say in the pull request that you checked.

## Pull requests

Opening a pull request fills in [the template](.github/pull_request_template.md). Keep its
sections, and fill in **AI assistance** every time:

- whether an AI tool wrote or changed any part of the pull request (code, tests, docs, the
  description itself);
- if so, the tool and the exact model (e.g. Claude Code, `claude-opus-5-5`), and what it did.

No "Generated with …" lines or AI co-author trailers in commits or descriptions: the AI section
says it once, in a form every pull request shares.

Comments in code follow the rules in [CLAUDE.md](CLAUDE.md#comments): a comment says why, never
the history.
