// Demo SPA for nuxt-backend-lens. Served behind the Caddy proxy (http://localhost:$DEMO_PORT), so
// every backend call (/api, /sanctum, /__clockwork) is same-origin.
const demoPort = Number(process.env.DEMO_PORT ?? 18080)

export default defineNuxtConfig({

  // The module is loaded from source (a relative path works inside the frontend container and
  // gives HMR on module changes). It is also a workspace devDependency, so the module can resolve
  // itself from here and have Vite pre-bundle its lazy client dependencies. Packaged consumption is
  // checked separately (make package).
  modules: ['../../packages/nuxt-backend-lens/src/module', 'nuxt-auth-sanctum'],
  ssr: false,
  devtools: { enabled: true },

  app: {
    head: { title: 'nuxt-backend-lens demo' },
  },

  css: ['~/assets/main.css'],

  runtimeConfig: {
    public: {
      // Backend origin for the /cross-origin page (NUXT_PUBLIC_CROSS_ORIGIN_API).
      crossOriginApi: '',
      // That page on the cross-origin entry, for the link to it (NUXT_PUBLIC_CROSS_ORIGIN_PAGE).
      crossOriginPage: '',
    },
  },
  compatibilityDate: '2025-07-15',

  vite: {
    // axios is imported by a page only; without this, Vite finds it on first visit and reloads.
    // The module's own lazy dependencies are pre-bundled by the module itself.
    optimizeDeps: {
      include: ['axios'],
    },
    server: {
      // The dev server is reached through the proxy; let HMR connect back through it.
      ws: { clientPort: demoPort },
    },
  },

  backendLens: {
    include: ['/api/**', '/sanctum/**'],
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
})
