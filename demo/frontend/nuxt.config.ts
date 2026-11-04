// Demo SPA for nuxt-backend-lens. Served behind the Caddy proxy (http://localhost:$DEMO_PORT), so
// every backend call (/api, /sanctum, /__clockwork) is same-origin.
const demoPort = Number(process.env.DEMO_PORT ?? 18080)

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  devtools: { enabled: true },

  // The module is loaded from source (a relative path works inside the frontend container and
  // gives HMR on module changes). Packaged consumption is checked separately in CI.
  modules: ['../../packages/nuxt-backend-lens/src/module', 'nuxt-auth-sanctum'],

  backendLens: {
    include: ['/api/**', '/sanctum/**'],
  },

  css: ['~/assets/main.css'],

  app: {
    head: { title: 'nuxt-backend-lens demo' },
  },

  sanctum: {
    // Overridden at runtime by NUXT_PUBLIC_SANCTUM_BASE_URL (docker-compose sets the proxy origin).
    baseUrl: `http://localhost:${demoPort}`,
    mode: 'cookie',
    endpoints: {
      csrf: '/sanctum/csrf-cookie',
      login: '/api/login',
      logout: '/api/logout',
      user: '/api/user',
    },
    redirect: {
      onLogin: '/reviews',
      onLogout: '/',
      onAuthOnly: '/reviews',
      onGuestOnly: '/reviews',
    },
  },

  vite: {
    server: {
      // The dev server is reached through the proxy; let HMR connect back through it.
      ws: { clientPort: demoPort },
    },
  },
})
