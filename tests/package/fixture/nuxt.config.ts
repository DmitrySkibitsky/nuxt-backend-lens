// Consumer app for the packaged-module check (tests/package/check.mjs). It installs the packed
// tarball like a real user and switches the module with a build-time flag, the way a staging build
// would: BACKEND_LENS=1 nuxt build.
export default defineNuxtConfig({
  modules: ['nuxt-backend-lens'],
  ssr: false,
  compatibilityDate: '2025-07-15',
  backendLens: {
    enabled: process.env.BACKEND_LENS === '1',
  },
})
