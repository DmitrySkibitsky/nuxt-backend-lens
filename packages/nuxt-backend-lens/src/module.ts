import { addImports, addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'
import { createDefu } from 'defu'
import { type BackendLensOptions, defaultOptions } from './runtime/core/options'

export type { BackendLensOptions } from './runtime/core/options'
export type * from './runtime/core/types'

type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

export type ModuleOptions = DeepPartial<BackendLensOptions>

/** Like defu, but arrays from the user replace the defaults instead of being concatenated. */
const mergeOptions = createDefu((target, key, value) => {
  if (Array.isArray(value)) {
    ;(target as Record<PropertyKey, unknown>)[key] = value
    return true
  }
  return false
})

export function resolveOptions(input: ModuleOptions): BackendLensOptions {
  return mergeOptions(input, defaultOptions) as BackendLensOptions
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
  setup(input, nuxt) {
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

    addImports([
      { name: 'useBackendLens', from: resolver.resolve('./runtime/composables') },
      { name: 'defineBackendLensAdapter', from: resolver.resolve('./runtime/composables') },
    ])
  },
})
