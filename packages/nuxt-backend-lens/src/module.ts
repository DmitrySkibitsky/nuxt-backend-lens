import { addImports, addPlugin, createResolver, defineNuxtModule, extendViteConfig } from '@nuxt/kit'
import { resolveModulePath } from 'exsolve'
import { setupDevtoolsTab } from './devtools'
import { type ModuleOptions, mergeOptions, resolveOptions } from './runtime/core/options'

export type { BackendLensOptions, ModuleOptions } from './runtime/core/options'
export type * from './runtime/core/types'
export { resolveOptions } from './runtime/core/options'

/** Dependencies the client imports lazily: unknown to Vite's initial scan unless listed. */
const CLIENT_DEPENDENCIES = ['sql-formatter', '@vue/devtools-api', '@vue/devtools-kit']

/**
 * `optimizeDeps.include` entries for the lazily imported client dependencies, so Vite pre-bundles
 * them at start instead of discovering them at runtime and reloading the page. When the app can
 * resolve the module by name (installed, or a workspace dependency), they are nested deps
 * (`nuxt-backend-lens > sql-formatter`); otherwise only names the app resolves itself are listed:
 * Vite fails on unresolvable ones. Resolved like Vite does (exsolve): docs/architecture.md.
 */
export function clientDependencyIncludes(rootDir: string): string[] {
  const from = rootDir.endsWith('/') ? rootDir : `${rootDir}/`
  const resolvable = (id: string) => Boolean(resolveModulePath(id, { from, try: true, cache: false }))
  if (resolvable('nuxt-backend-lens')) {
    return CLIENT_DEPENDENCIES.map(dependency => `nuxt-backend-lens > ${dependency}`)
  }
  return CLIENT_DEPENDENCIES.filter(resolvable)
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-backend-lens',
    configKey: 'backendLens',
    compatibility: {
      nuxt: '>=4.0.0',
    },
  },
  // No `defaults` on purpose: Nuxt merges them with defu, which concatenates arrays.
  async setup(input, nuxt) {
    const options = resolveOptions(input)
    if (!options.enabled) {
      return
    }

    const resolver = createResolver(import.meta.url)

    // Options reach the browser through public runtime config, so NUXT_PUBLIC_BACKEND_LENS_* env
    // variables can override scalars at runtime.
    const publicConfig = nuxt.options.runtimeConfig.public as Record<string, unknown>
    publicConfig.backendLens = mergeOptions((publicConfig.backendLens ?? {}) as ModuleOptions, options)

    addPlugin({ src: resolver.resolve('./runtime/plugin.client'), mode: 'client' })

    if (nuxt.options.dev) {
      const includes = clientDependencyIncludes(nuxt.options.rootDir)
      extendViteConfig((config) => {
        config.optimizeDeps ??= {}
        config.optimizeDeps.include = [...(config.optimizeDeps.include ?? []), ...includes]
      }, { server: false })
    }

    addImports([
      { name: 'useBackendLens', from: resolver.resolve('./runtime/composables') },
      { name: 'defineBackendLensAdapter', from: resolver.resolve('./runtime/composables') },
    ])

    if (nuxt.options.dev && options.devtools.enabled) {
      await setupDevtoolsTab(options.devtools, nuxt, resolver)
    }
  },
})
