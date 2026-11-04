// In-page toolbar shell: mounts the lens UI as a separate Vue app inside a Shadow DOM, so the app's
// styles and the toolbar's styles never affect each other. Loaded lazily after the app has mounted.

import { createApp } from 'vue'
import { IGNORE_ATTRIBUTE } from '../core/actions'
import type { BackendLens } from '../core/collector'
import LensApp from '../ui/LensApp.vue'
import { createUiState, LENS_UI_STATE } from '../ui/state'
import { documentColorMode } from '../ui/theme'
import styles from '../ui/styles.css?inline'

const HOST_ID = 'backend-lens-toolbar'

/** Mounts the toolbar; returns an unmount function. Replaces a previously mounted toolbar. */
export function mountToolbar(lens: BackendLens): () => void {
  document.getElementById(HOST_ID)?.remove()

  const host = document.createElement('div')
  host.id = HOST_ID
  // Clicks on the toolbar are not user actions of the app.
  host.setAttribute(IGNORE_ATTRIBUTE, '')
  document.body.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = styles
  shadow.appendChild(style)
  const container = document.createElement('div')
  shadow.appendChild(container)

  // The app's own colour mode when it sets a `dark` / `light` class (e.g. @nuxtjs/color-mode),
  // otherwise the system preference.
  const [colorMode, stopColorMode] = documentColorMode(document)
  const [state, unsubscribe] = createUiState(lens, colorMode)
  const app = createApp(LensApp)
  app.provide(LENS_UI_STATE, state)
  app.mount(container)

  return () => {
    stopColorMode()
    unsubscribe()
    app.unmount()
    host.remove()
  }
}
