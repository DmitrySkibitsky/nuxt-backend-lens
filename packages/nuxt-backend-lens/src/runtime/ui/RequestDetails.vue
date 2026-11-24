<template>
  <article
    class="bl-details"
    data-testid="backend-lens-details"
  >
    <header class="bl-details-header">
      <div class="bl-details-title">
        <span class="bl-method">{{ entry.method }}</span>
        <span class="bl-path">{{ entry.path }}</span>
        <span
          class="bl-status"
          :class="statusClass(entry.status)"
        >{{ entry.status }}</span>
      </div>
      <div class="bl-details-meta">
        <SourceLink
          v-if="details?.controller"
          :location="controller"
          data-testid="backend-lens-controller"
        >
          {{ details.controller }}
        </SourceLink>
        <span>{{ formatMs(details?.durationMs ?? entry.durationMs) }}</span>
        <span v-if="details?.memoryBytes">{{ formatBytes(details.memoryBytes) }}</span>
        <span v-if="entry.ref">via {{ entry.ref.adapter }}</span>
        <span
          v-if="action"
          data-testid="backend-lens-triggered-by"
        >triggered by {{ formatAction(action) }} (+{{ formatMs(entry.startTime - action.time) }})</span>
        <a
          v-if="webUrl"
          :href="webUrl"
          target="_blank"
          rel="noopener"
        >Open in {{ entry.ref?.adapter }}</a>
        <a
          v-if="recordUrl"
          :href="recordUrl"
          target="_blank"
          rel="noopener"
          data-testid="backend-lens-record-link"
        >raw record</a>
      </div>
    </header>

    <p
      v-if="entry.detailsState === 'none'"
      class="bl-empty"
    >
      This response carries no debug id that a registered adapter recognizes.
    </p>
    <p
      v-else-if="entry.detailsState === 'loading' || entry.detailsState === 'idle'"
      class="bl-empty"
    >
      Loading record…
    </p>
    <p
      v-else-if="entry.detailsState === 'error'"
      class="bl-empty bl-status-error"
    >
      {{ entry.error }}
      <button
        type="button"
        class="bl-button"
        @click="emit('reload')"
      >
        Retry
      </button>
    </p>

    <template v-else-if="details && analysis">
      <p
        v-if="launchError"
        class="bl-note bl-status-error"
        role="alert"
        data-testid="backend-lens-launch-error"
      >
        Could not open the editor: {{ launchError }}
      </p>
      <p
        v-if="details.note"
        class="bl-note"
        data-testid="backend-lens-note"
      >
        {{ details.note }}
      </p>
      <div
        v-for="(exception, index) in details.exceptions"
        :key="`exception-${index}`"
        class="bl-exception"
      >
        <strong>{{ exception.type }}</strong>: {{ exception.message }}
        <SourceLink
          class="bl-muted"
          :location="exception.file ? { file: exception.file, line: exception.line ?? null } : undefined"
        />
      </div>

      <nav
        class="bl-tabs"
        role="tablist"
        aria-label="Record"
      >
        <button
          v-for="(tab, index) in tabs"
          :id="`${uid}-tab-${tab.id}`"
          :key="tab.id"
          type="button"
          role="tab"
          class="bl-tab"
          :class="{ 'bl-tab-active': activeTab === tab.id }"
          :aria-selected="activeTab === tab.id"
          :aria-controls="`${uid}-panel`"
          :tabindex="activeTab === tab.id ? 0 : -1"
          :data-testid="`backend-lens-tab-${tab.id}`"
          @click="activeTab = tab.id"
          @keydown="onTabKey($event, index)"
        >
          {{ tab.label }} <span class="bl-muted">{{ tab.count }}</span>
        </button>
      </nav>

      <div
        :id="`${uid}-panel`"
        role="tabpanel"
        :aria-labelledby="`${uid}-tab-${activeTab}`"
      >
        <QueriesTab
          v-if="activeTab === 'queries'"
          :queries="details.queries"
          :analysis="analysis"
          :slow-query-ms="lens.options.slowQueryMs"
          :sql-options="lens.options.sql"
        />
        <LogsTab
          v-else-if="activeTab === 'logs'"
          :logs="details.logs"
        />
        <CacheTab
          v-else-if="activeTab === 'cache'"
          :cache="details.cache"
        />
        <TimelineTab
          v-else
          :details="details"
        />
      </div>
    </template>
  </article>
</template>

<script setup lang="ts">
import { computed, nextTick, provide, ref, useId, watch } from 'vue'
import { analyzeDetails } from '../core/analysis'
import { controllerLocation, editorTarget } from '../core/editor'
import type { RequestEntry } from '../core/types'
import { httpUrl } from '../core/url'
import CacheTab from './CacheTab.vue'
import { SOURCE_LINKS } from './editor'
import { analysisOptions, formatAction, formatBytes, formatMs, statusClass } from './format'
import LogsTab from './LogsTab.vue'
import QueriesTab from './QueriesTab.vue'
import SourceLink from './SourceLink.vue'
import { useLensUiState } from './state'
import TimelineTab from './TimelineTab.vue'

const props = defineProps<{
  entry: RequestEntry
}>()

const emit = defineEmits<{
  reload: []
}>()

const { lens, actions, editorSettings } = useLensUiState()
const action = computed(() => actions.value.find(item => item.id === props.entry.actionId))

type TabId = 'queries' | 'logs' | 'cache' | 'timeline'
const activeTab = ref<TabId>('queries')
const uid = useId()

/** Arrow keys, Home and End move between tabs (WAI-ARIA tabs pattern, automatic activation). */
function onTabKey(event: KeyboardEvent, index: number) {
  const last = tabs.value.length - 1
  const targets: Record<string, number> = {
    ArrowRight: index === last ? 0 : index + 1,
    ArrowLeft: index === 0 ? last : index - 1,
    Home: 0,
    End: last,
  }
  const next = targets[event.key]
  if (next === undefined) {
    return
  }
  event.preventDefault()
  activeTab.value = tabs.value[next]!.id
  const tablist = (event.currentTarget as HTMLElement).parentElement
  void nextTick(() => tablist?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus())
}

const webUrl = computed(() => httpUrl(props.entry.ref?.webUrl))
const recordUrl = computed(() => httpUrl(props.entry.ref?.url))

const details = computed(() => props.entry.details)
const controller = computed(() => (details.value ? controllerLocation(details.value, lens.options.editor.namespaces) : undefined))

const launchError = ref<string>()
watch(() => props.entry.key, () => {
  launchError.value = undefined
})
provide(SOURCE_LINKS, {
  target: location => editorTarget(location, {
    settings: editorSettings.value,
    options: lens.options.editor,
    basePath: details.value?.basePath,
    launcher: lens.editorLauncher,
  }),
  launch: (command) => {
    launchError.value = undefined
    lens.launchEditor(command).catch((error: unknown) => {
      launchError.value = error instanceof Error ? error.message : String(error)
    })
  },
})
const analysis = computed(() => (details.value ? analyzeDetails(details.value, analysisOptions(lens.options)) : undefined))

const tabs = computed(() => [
  { id: 'queries' as const, label: 'Queries', count: details.value?.queries.length ?? 0 },
  { id: 'logs' as const, label: 'Logs', count: details.value?.logs.length ?? 0 },
  { id: 'cache' as const, label: 'Cache', count: details.value?.cache.length ?? 0 },
  { id: 'timeline' as const, label: 'Timeline', count: details.value?.timeline.length ?? 0 },
])
</script>
