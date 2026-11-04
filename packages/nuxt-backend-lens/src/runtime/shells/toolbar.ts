// In-page toolbar shell: mounts the lens UI as a separate Vue app inside a Shadow DOM, so the app's
// styles and the toolbar's styles never affect each other. Loaded lazily after the app has mounted.

import { createApp } from 'vue'
import type { BackendLens } from '../core/collector'
import LensApp from '../ui/LensApp.vue'
import { createUiState, LENS_UI_STATE } from '../ui/state'
import styles from '../ui/styles.css?inline'

const HOST_ID = 'backend-lens-toolbar'

/** Mounts the toolbar; returns an unmount function. Replaces a previously mounted toolbar. */
export function mountToolbar(lens: BackendLens): () => void {
  document.getElementById(HOST_ID)?.remove()

  const host = document.createElement('div')
  host.id = HOST_ID
  document.body.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = styles
  shadow.appendChild(style)
  const container = document.createElement('div')
  shadow.appendChild(container)

  const [state, unsubscribe] = createUiState(lens)
  const app = createApp(LensApp)
  app.provide(LENS_UI_STATE, state)
  app.mount(container)

  return () => {
    unsubscribe()
    app.unmount()
    host.remove()
  }
}
