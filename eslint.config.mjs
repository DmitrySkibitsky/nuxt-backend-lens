// @ts-check
// One lint + format config for the whole workspace (module, playground, demo frontend, tests,
// scripts): ESLint Stylistic formats TS / JS / Vue through @nuxt/eslint-config, eslint-plugin-jsonc
// formats JSON. CSS is Stylelint's (stylelint.config.mjs); PHP is Pint's (demo/backend).
//
//   pnpm lint        check     (make format-check)
//   pnpm format      fix       (make format)
//
// Inspect the resolved config: npx @eslint/config-inspector
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'
import jsonc from 'eslint-plugin-jsonc'

/** Formatting rules shared by JSON and JSONC. */
const jsonFormatting = {
  'jsonc/indent': ['error', 2],
  'jsonc/key-spacing': ['error', { beforeColon: false, afterColon: true }],
  'jsonc/comma-style': ['error', 'last'],
  'jsonc/array-bracket-spacing': ['error', 'never'],
  'jsonc/object-curly-spacing': ['error', 'always'],
  'jsonc/object-curly-newline': ['error', { consistent: true }],
  'jsonc/object-property-newline': ['error', { allowAllPropertiesOnSameLine: true }],
  'jsonc/no-irregular-whitespace': 'error',
}

export default createConfigForNuxt({
  features: {
    // Explicit: auto-detection looks for `typescript` in the workspace root only.
    typescript: true,
    // Rules for tooling code (jsdoc, regexp, unicorn), here for the whole workspace.
    tooling: true,
    stylistic: true,
  },
  dirs: {
    // Nuxt app sources (pages, components, …) for Nuxt-aware rules.
    src: [
      './packages/nuxt-backend-lens/playground',
      './demo/frontend/app',
    ],
  },
})
  .prepend({
    name: 'workspace/ignores',
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/.data/**',
      '.corepack/**',
      'test-results/**',
      'tests/package/.work/**',
      // PHP app: formatted by Pint, its JSON by Composer.
      'demo/backend/**',
      'demo/.state/**',
      // Generated or captured as is.
      'pnpm-lock.yaml',
      'flake.lock',
      'packages/*/test/fixtures/records/**',
    ],
  })
  .append(
    // The plugin's presets contain entries without `files` that would set the JSON parser for every
    // file (TS / Vue included), so each entry is scoped explicitly.
    ...jsonc.configs['flat/recommended-with-json'].map(config => ({
      ...config,
      files: ['**/*.json'],
      ignores: ['**/tsconfig*.json', '**/.vscode/*.json'],
    })),
    {
      name: 'workspace/json',
      files: ['**/*.json'],
      ignores: ['**/tsconfig*.json', '**/.vscode/*.json'],
      rules: {
        ...jsonFormatting,
        'jsonc/comma-dangle': ['error', 'never'],
      },
    },
    // tsconfig and editor settings are JSONC: comments and trailing commas are allowed there.
    ...jsonc.configs['flat/recommended-with-jsonc'].map(config => ({
      ...config,
      files: ['**/tsconfig*.json', '**/.vscode/*.json'],
    })),
    {
      name: 'workspace/jsonc',
      files: ['**/tsconfig*.json', '**/.vscode/*.json'],
      rules: jsonFormatting,
    },
  )
