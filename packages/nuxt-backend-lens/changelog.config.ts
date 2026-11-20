import type { ChangelogConfig } from 'changelogen'

// The changelog is for module users: commits on the stand, tests, tooling and contributor docs stay
// out of it. Scopes cannot be filtered, so `fix(demo)` still shows up: trim it in the release PR.
export default {
  types: {
    docs: false,
    refactor: false,
    build: false,
    chore: false,
    examples: false,
    test: false,
    style: false,
    ci: false,
  },
  hideAuthorEmail: true,
} satisfies Partial<ChangelogConfig>
