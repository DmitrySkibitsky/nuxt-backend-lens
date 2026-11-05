// Nuxt DevTools shell: runs inside the tab's iframe (app window → DevTools client iframe → this
// iframe, all same-origin). It finds the lens the app runs and renders the same UI, embedded.
// The core is framework-free, so this realm's Vue can subscribe to the app realm's store directly.

import { createApp, h } from 'vue'
import type { BackendLens } from '../core/collector'
import { findInAncestors, LENS_GLOBAL_KEY } from '../core/global'
import LensApp from '../ui/LensApp.vue'
import { createUiState, LENS_UI_STATE } from '../ui/state'
import { adoptFontFaces, DEVTOOLS_COLOR_MODE_CLASSES, DEVTOOLS_FONT_FAMILIES, documentColorMode, findColorModeDocument } from '../ui/theme'
import styles from '../ui/styles.css?inline'

const POLL_MS = 500

/** The app's lens, published on an ancestor window. */
function findLens(): BackendLens | undefined {
  return findInAncestors(window, ancestor => (ancestor as unknown as Record<string, BackendLens | undefined>)[LENS_GLOBAL_KEY])
}

export function mountDevtoolsPanel(container: HTMLElement): void {
  const style = document.createElement('style')
  style.textContent = styles
  document.head.appendChild(style)

  let unmount: (() => void) | undefined
  let mountedLens: BackendLens | undefined
  // Follow Nuxt DevTools' own colour mode (its client document carries `light` / `dark`), and use
  // its fonts: the client already loaded DM Sans / DM Mono, the iframe borrows their @font-face.
  const devtoolsDocument = findColorModeDocument(DEVTOOLS_COLOR_MODE_CLASSES)
  const [colorMode, stopColorMode] = documentColorMode(devtoolsDocument ?? document, DEVTOOLS_COLOR_MODE_CLASSES)
  if (devtoolsDocument && adoptFontFaces(devtoolsDocument, document, DEVTOOLS_FONT_FAMILIES)) {
    document.documentElement.classList.add('bl-devtools-fonts')
  }

  const mount = (lens: BackendLens) => {
    unmount?.()
    const [state, unsubscribe] = createUiState(lens, colorMode)
    const app = createApp({ render: () => h(LensApp, { embedded: true }) })
    app.provide(LENS_UI_STATE, state)
    app.mount(container)
    mountedLens = lens
    unmount = () => {
      unsubscribe()
      app.unmount()
    }
  }

  const waiting = () => {
    container.innerHTML = '<p class="bl-empty" style="font: 13px system-ui, sans-serif; padding: 16px">'
      + 'Waiting for Backend Lens in the app…</p>'
  }

  // The app may reload (HMR, navigation to another full page) and replace its lens: follow it.
  const sync = () => {
    const lens = findLens()
    if (lens && lens !== mountedLens) {
      mount(lens)
    }
    else if (!lens && mountedLens) {
      unmount?.()
      unmount = undefined
      mountedLens = undefined
      waiting()
    }
  }

  waiting()
  sync()
  const timer = window.setInterval(sync, POLL_MS)

  // The store lives in the app window: drop our listener when this iframe goes away.
  window.addEventListener('pagehide', () => {
    window.clearInterval(timer)
    unmount?.()
    stopColorMode()
  })
}
