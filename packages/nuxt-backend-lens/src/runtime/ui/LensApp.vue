<template>
  <div
    class="bl-root"
    :class="embedded ? 'bl-embedded' : `bl-pos-${lens.options.toolbar.position}`"
    :data-theme="colorMode"
    data-testid="backend-lens-root"
  >
    <button
      v-if="!embedded && !open"
      type="button"
      class="bl-badge"
      :class="{ 'bl-badge-problem': summary.errors > 0 }"
      data-testid="backend-lens-badge"
      title="Backend Lens"
      @click="open = true"
    >
      <span class="bl-badge-title">Backend</span>
      <span data-testid="backend-lens-badge-requests">{{ summary.requests }} req</span>
      <span data-testid="backend-lens-badge-queries">{{ summary.queries }} q</span>
      <span>{{ formatMs(summary.databaseMs) }} DB</span>
      <span
        v-if="issueCount > 0"
        class="bl-badge-warn"
        data-testid="backend-lens-badge-issues"
      >{{ issueCount }} ⚠</span>
      <span
        v-if="summary.errors > 0"
        class="bl-badge-alert"
      >{{ summary.errors }} ✕</span>
    </button>

    <section
      v-else
      ref="panel"
      class="bl-panel"
      :style="panelStyle"
      data-testid="backend-lens-panel"
      aria-label="Backend Lens"
    >
      <template v-if="!embedded">
        <ResizeHandle
          :edge="edges.x"
          label="Panel width"
          :min="LAYOUT_LIMITS.minWidth"
          :size="() => panel?.offsetWidth ?? layout.width"
          :max="() => viewportSize('width')"
          data-testid="backend-lens-resize-width"
          @resize="value => set('width', value)"
          @end="persist"
          @reset="reset('width')"
        />
        <ResizeHandle
          :edge="edges.y"
          label="Panel height"
          :min="LAYOUT_LIMITS.minHeight"
          :size="() => panel?.offsetHeight ?? layout.height"
          :max="() => viewportSize('height')"
          data-testid="backend-lens-resize-height"
          @resize="value => set('height', value)"
          @end="persist"
          @reset="reset('height')"
        />
      </template>
      <header class="bl-panel-header">
        <!-- The DevTools tab already carries the title. -->
        <strong v-if="!embedded">Backend Lens</strong>
        <span class="bl-muted">{{ scopeLabel }}</span>
        <span class="bl-spacer" />
        <label class="bl-toggle">
          <input
            v-model="showAll"
            type="checkbox"
          >
          all navigations
        </label>
        <button
          type="button"
          class="bl-button"
          @click="clear"
        >
          Clear
        </button>
        <button
          v-if="!embedded"
          type="button"
          class="bl-button"
          aria-label="Close"
          @click="open = false"
        >
          ✕
        </button>
      </header>
      <div
        class="bl-summary"
        data-testid="backend-lens-summary"
      >
        <span>{{ summary.requests }} requests</span>
        <span>{{ summary.queries }} queries</span>
        <span>{{ formatMs(summary.databaseMs) }} DB</span>
        <span
          v-if="summary.nPlusOne"
          class="bl-chip bl-issue-n-plus-one"
        >{{ summary.nPlusOne }} N+1</span>
        <span
          v-if="summary.duplicates"
          class="bl-chip bl-issue-duplicate"
        >{{ summary.duplicates }} duplicate</span>
        <span
          v-if="summary.slow"
          class="bl-chip bl-issue-slow"
        >{{ summary.slow }} slow</span>
        <span
          v-if="summary.errors"
          class="bl-chip bl-status-error"
        >{{ summary.errors }} failed</span>
        <span
          v-for="repeated in summary.repeatedRequests"
          :key="`${repeated.method} ${repeated.path}`"
          class="bl-chip bl-issue-repeated"
          data-testid="backend-lens-repeated"
          :title="`${repeated.method} ${repeated.path} was requested ${repeated.count} times`"
        >{{ repeated.count }}× {{ repeated.method }} {{ repeated.path }}</span>
        <span
          v-if="summary.loaded < summary.requests"
          class="bl-muted"
        >({{ summary.requests - summary.loaded }} not loaded)</span>
      </div>
      <div
        ref="body"
        class="bl-panel-body"
        :style="bodyStyle"
      >
        <RequestList
          :entries="visible"
          :selected-key="selectedKey"
          :show-navigation="showAll"
          @select="select"
        />
        <ResizeHandle
          edge="right"
          class="bl-splitter"
          label="Request list width"
          :min="LAYOUT_LIMITS.minListWidth"
          :size="listWidth"
          :max="() => (body?.clientWidth ?? 0) - LAYOUT_LIMITS.minDetailsWidth"
          data-testid="backend-lens-splitter"
          @resize="value => set('listWidth', value)"
          @end="persist"
          @reset="reset('listWidth')"
        />
        <RequestDetails
          v-if="selected"
          :entry="selected"
          @reload="lens.load(selected.key)"
        />
        <p
          v-else
          class="bl-empty"
        >
          {{ visible.length ? 'Select a request.' : 'No backend requests in this navigation yet.' }}
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { summarizeNavigation } from '../core/analysis'
import { analysisOptions, formatMs } from './format'
import { LAYOUT_LIMITS, resizableEdges, usePanelLayout } from './layout'
import RequestDetails from './RequestDetails.vue'
import RequestList from './RequestList.vue'
import ResizeHandle from './ResizeHandle.vue'
import { useLensUiState } from './state'

const props = withDefaults(defineProps<{
  /** Full-size panel without badge or close button (Nuxt DevTools tab). */
  embedded?: boolean
}>(), { embedded: false })

const { lens, entries, navigations, currentNavigationId, colorMode } = useLensUiState()

const open = ref(props.embedded || lens.options.toolbar.open)

const panel = useTemplateRef<HTMLElement>('panel')
const body = useTemplateRef<HTMLElement>('body')
const { layout, set, reset, persist } = usePanelLayout(props.embedded ? 'embedded' : 'toolbar')
const edges = resizableEdges(lens.options.toolbar.position)

/** Room the toolbar panel leaves around itself; matches the 12px offset of `.bl-pos-*`. */
const VIEWPORT_MARGIN = 24
const viewportSize = (axis: 'width' | 'height') =>
  (axis === 'width' ? window.innerWidth : window.innerHeight) - VIEWPORT_MARGIN

// The stored size is a wish; CSS keeps it inside the viewport, also after the window shrinks.
const panelStyle = computed(() => (props.embedded
  ? undefined
  : {
      width: `min(${layout.value.width}px, calc(100vw - ${VIEWPORT_MARGIN}px))`,
      height: `min(${layout.value.height}px, calc(100vh - ${VIEWPORT_MARGIN}px))`,
    }))

// The list keeps its stored width while the details pane keeps its minimum; the splitter follows.
const bodyStyle = computed(() => ({
  '--bl-list-column': `clamp(${LAYOUT_LIMITS.minListWidth}px, ${layout.value.listWidth}px, `
    + `calc(100% - ${LAYOUT_LIMITS.minDetailsWidth}px))`,
}))

const listWidth = () => body.value?.querySelector<HTMLElement>('.bl-list')?.offsetWidth ?? layout.value.listWidth
const showAll = ref(false)
const selectedKey = ref<number>()

const visible = computed(() => (showAll.value
  ? entries.value
  : entries.value.filter(entry => entry.navigationId === currentNavigationId.value)))

const selected = computed(() => entries.value.find(entry => entry.key === selectedKey.value))

const summary = computed(() => summarizeNavigation(visible.value, analysisOptions(lens.options)))

const issueCount = computed(() => summary.value.nPlusOne + summary.value.duplicates + summary.value.slow
  + summary.value.repeatedRequests.length)

const scopeLabel = computed(() => {
  if (showAll.value) {
    return 'all navigations'
  }
  const route = navigations.value.find(item => item.id === currentNavigationId.value)?.route
  return route ? `on ${route}` : ''
})

function select(key: number) {
  selectedKey.value = key
  const entry = entries.value.find(item => item.key === key)
  if (entry && (entry.detailsState === 'idle' || entry.detailsState === 'error')) {
    void lens.load(key)
  }
}

function clear() {
  selectedKey.value = undefined
  lens.clear()
}
</script>
