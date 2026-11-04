// Vue DevTools shell: a "Backend requests" layer in the Timeline (Nuxt DevTools → Timeline, or the
// browser extension), next to Vue's own events. Dev only.
//
// devtools-kit drops timeline events while no DevTools client is connected (high-performance mode)
// and may run the plugin setup either at once or only when a client connects. The emitter therefore
// sends nothing until devtools-kit accepts events, then catches up from the request list: requests
// made before DevTools was opened show up, and none is sent twice. devtools-kit can also run the
// same setup twice (early, then again when a client connects), so the setup is idempotent.

import { onDevToolsClientConnected, setupDevtoolsPlugin } from '@vue/devtools-api'
import { devtoolsState } from '@vue/devtools-kit'
import type { App } from 'vue'
import type { BackendLens } from '../core/collector'
import { createTimelineEmitter } from '../core/timeline'

export const TIMELINE_LAYER_ID = 'backend-lens'

export function setupVueDevtoolsTimeline(app: App, lens: BackendLens, color: number): void {
  let initialized = false
  setupDevtoolsPlugin({
    id: 'nuxt-backend-lens',
    label: 'Backend Lens',
    packageName: 'nuxt-backend-lens',
    app,
    enableEarlyProxy: true,
  }, (api) => {
    if (initialized) {
      return
    }
    initialized = true
    api.addTimelineLayer({ id: TIMELINE_LAYER_ID, label: 'Backend requests', color })

    const emitter = createTimelineEmitter(
      event => api.addTimelineEvent({ layerId: TIMELINE_LAYER_ID, event }),
      {
        nPlusOneThreshold: lens.options.nPlusOneThreshold,
        slowQueryMs: lens.options.slowQueryMs,
        timeOrigin: performance.timeOrigin,
        canEmit: () => !devtoolsState.highPerfModeEnabled,
      },
    )
    const sync = () => emitter.sync(lens.store.entries, lens.store.actions)
    sync()
    lens.store.subscribe(sync)
    void onDevToolsClientConnected(sync)
  })
}
