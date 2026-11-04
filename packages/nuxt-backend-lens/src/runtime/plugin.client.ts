import { defineNuxtPlugin, useRuntimeConfig } from '#app'
import { START_LOCATION } from 'vue-router'
import { type BackendLens, createBackendLens } from './core/collector'
import { LENS_GLOBAL_KEY } from './core/global'
import type { BackendLensOptions } from './core/options'

export default defineNuxtPlugin({
  name: 'backend-lens',
  // Before every other plugin: nuxt-auth-sanctum and others fire requests during their own setup.
  enforce: 'pre',
  setup(nuxtApp) {
    const options = useRuntimeConfig().public.backendLens as unknown as BackendLensOptions
    const globalScope = window as unknown as Record<string, BackendLens | undefined>

    // One lens per page, even across HMR reloads of the app. Published on window so the Nuxt
    // DevTools tab (another realm) can find it.
    globalScope[LENS_GLOBAL_KEY]?.destroy()
    const lens = createBackendLens(options, { window })
    globalScope[LENS_GLOBAL_KEY] = lens

    // Plugins (the router's included) have run by now. The first setRoute() names the initial
    // navigation, every later one starts a new navigation.
    nuxtApp.hook('app:created', () => {
      const router = nuxtApp.$router
      if (!router) {
        lens.setRoute(window.location.pathname + window.location.search)
        return
      }
      if (router.currentRoute.value !== START_LOCATION) {
        lens.setRoute(router.currentRoute.value.fullPath)
      }
      router.beforeEach((to) => {
        lens.setRoute(to.fullPath)
      })
    })

    if (options.toolbar.enabled) {
      nuxtApp.hook('app:mounted', async () => {
        const { mountToolbar } = await import('./shells/toolbar')
        mountToolbar(lens)
      })
    }

    return {
      provide: {
        backendLens: lens,
      },
    }
  },
})
