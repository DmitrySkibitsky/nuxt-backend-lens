// Vue DevTools shell: a "Backend requests" layer in the Timeline (Nuxt DevTools or the browser
// extension). Dev only. devtools-kit drops events while no client is connected and may run the setup
// twice, hence the `canEmit` gate and the idempotent setup (docs/architecture.md).

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
