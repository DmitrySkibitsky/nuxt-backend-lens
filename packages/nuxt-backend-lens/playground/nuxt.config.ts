import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  modules: ['nuxt-backend-lens'],
  ssr: false,
  devtools: { enabled: true },
  runtimeConfig: {
    // Records captured from the demo stand, replayed by server/middleware/mock-backend.ts.
    fixturesDir: fileURLToPath(new URL('../test/fixtures/records', import.meta.url)),
  },
  compatibilityDate: 'latest',
  backendLens: {
    toolbar: { open: true },
  },
})
