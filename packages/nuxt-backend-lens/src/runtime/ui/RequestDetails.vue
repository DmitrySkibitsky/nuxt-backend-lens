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
        <span v-if="details?.controller">{{ details.controller }}</span>
        <span>{{ formatMs(details?.durationMs ?? entry.durationMs) }}</span>
        <span v-if="details?.memoryBytes">{{ formatBytes(details.memoryBytes) }}</span>
        <span v-if="entry.ref">via {{ entry.ref.adapter }}</span>
        <a
          v-if="entry.ref?.webUrl"
          :href="entry.ref.webUrl"
          target="_blank"
          rel="noopener"
        >Open in {{ entry.ref.adapter }}</a>
        <a
          v-if="entry.ref"
          :href="entry.ref.url"
          target="_blank"
          rel="noopener"
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
      <div
        v-for="(exception, index) in details.exceptions"
        :key="`exception-${index}`"
        class="bl-exception"
      >
        <strong>{{ exception.type }}</strong>: {{ exception.message }}
        <span class="bl-muted">{{ formatFrame(exception.file, exception.line) }}</span>
      </div>

      <nav
        class="bl-tabs"
        role="tablist"
      >
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          role="tab"
          class="bl-tab"
          :class="{ 'bl-tab-active': activeTab === tab.id }"
          :aria-selected="activeTab === tab.id"
          :data-testid="`backend-lens-tab-${tab.id}`"
          @click="activeTab = tab.id"
        >
          {{ tab.label }} <span class="bl-muted">{{ tab.count }}</span>
        </button>
      </nav>

      <QueriesTab
        v-if="activeTab === 'queries'"
        :queries="details.queries"
        :analysis="analysis"
        :slow-query-ms="lens.options.slowQueryMs"
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
    </template>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { analyzeDetails } from '../core/analysis'
import type { RequestEntry } from '../core/types'
import CacheTab from './CacheTab.vue'
import { analysisOptions, formatBytes, formatFrame, formatMs, statusClass } from './format'
import LogsTab from './LogsTab.vue'
import QueriesTab from './QueriesTab.vue'
import { useLensUiState } from './state'
import TimelineTab from './TimelineTab.vue'

const props = defineProps<{
  entry: RequestEntry
}>()

const emit = defineEmits<{
  reload: []
}>()

const { lens } = useLensUiState()

type TabId = 'queries' | 'logs' | 'cache' | 'timeline'
const activeTab = ref<TabId>('queries')

const details = computed(() => props.entry.details)
const analysis = computed(() => (details.value ? analyzeDetails(details.value, analysisOptions(lens.options)) : undefined))

const tabs = computed(() => [
  { id: 'queries' as const, label: 'Queries', count: details.value?.queries.length ?? 0 },
  { id: 'logs' as const, label: 'Logs', count: details.value?.logs.length ?? 0 },
  { id: 'cache' as const, label: 'Cache', count: details.value?.cache.length ?? 0 },
  { id: 'timeline' as const, label: 'Timeline', count: details.value?.timeline.length ?? 0 },
])
</script>
