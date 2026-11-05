// In-page toolbar shell, loaded lazily after the app has mounted. Why a Shadow DOM: docs/architecture.md.

import { createApp } from 'vue'
import { IGNORE_ATTRIBUTE } from '../core/actions'
import type { BackendLens } from '../core/collector'
import LensApp from '../ui/LensApp.vue'
import { createUiState, LENS_UI_STATE } from '../ui/state'
import { documentColorMode } from '../ui/theme'
import styles from '../ui/styles.css?inline'

const HOST_ID = 'backend-lens-toolbar'
// On the host element, not in module state: a re-run plugin may load another copy of this module.
const UNMOUNT = Symbol.for('backend-lens.toolbar.unmount')

type ToolbarHost = HTMLElement & { [UNMOUNT]?: () => void }

/** Mounts the toolbar; returns an unmount function. Replaces a previously mounted toolbar. */
export function mountToolbar(lens: BackendLens): () => void {
  const previous = document.getElementById(HOST_ID) as ToolbarHost | null
  if (previous?.[UNMOUNT]) {
    previous[UNMOUNT]()
  }
  else {
    previous?.remove()
  }

  const host: ToolbarHost = document.createElement('div')
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

  // The app's own colour mode when it sets one of the configured classes (e.g. @nuxtjs/color-mode),
  // otherwise the system preference.
  const [colorMode, stopColorMode] = documentColorMode(document, lens.options.toolbar.colorModeClasses)
  const [state, unsubscribe] = createUiState(lens, colorMode)
  const app = createApp(LensApp)
  app.provide(LENS_UI_STATE, state)
  app.mount(container)

  const unmount = () => {
    if (host[UNMOUNT] !== unmount) {
      return
    }
    host[UNMOUNT] = undefined
    stopColorMode()
    unsubscribe()
    app.unmount()
    host.remove()
  }
  host[UNMOUNT] = unmount
  return unmount
}
