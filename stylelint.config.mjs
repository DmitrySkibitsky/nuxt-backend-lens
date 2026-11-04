// CSS lint + format for the workspace: stylelint-config-standard for correctness and conventions,
// @stylistic/stylelint-config for formatting (Stylelint 16+ moved stylistic rules out of the core).
//
//   pnpm lint / pnpm format   (make format-check / make format)

/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard', '@stylistic/stylelint-config'],
  ignoreFiles: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.nuxt/**',
    '**/.output/**',
    'demo/backend/**',
    'test-results/**',
    'tests/package/.work/**',
  ],
}
