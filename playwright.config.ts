import { defineConfig } from '@playwright/test'

// E2E tests run against the demo stand (`docker compose up -d` in demo/).
// DEMO_PORT is read from demo/.env by the `test:e2e` script; system Chrome is used when
// PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is set, so no bundled browser download is needed.
const demoPort = process.env.DEMO_PORT ?? '18080'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined

const ci = Boolean(process.env.CI)

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  // On CI a single retry absorbs a cold dev server (Vite optimizing deps on first hit); the retry
  // still keeps a trace, and a test that needs it is reported as flaky.
  retries: ci ? 1 : 0,
  forbidOnly: ci,
  reporter: ci ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://localhost:${demoPort}`,
    browserName: 'chromium',
    launchOptions: { executablePath },
    trace: 'retain-on-failure',
  },
})
