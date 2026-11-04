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

    <template v-else-if="details">
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

      <ol
        v-if="activeTab === 'queries'"
        class="bl-queries"
        data-testid="backend-lens-queries"
      >
        <li
          v-for="(query, index) in details.queries"
          :key="index"
          class="bl-query"
          :class="{ 'bl-slow': query.durationMs >= slowQueryMs }"
        >
          <div class="bl-query-head">
            <span class="bl-muted">#{{ index + 1 }}</span>
            <span class="bl-duration">{{ formatMs(query.durationMs) }}</span>
            <span
              v-if="query.callSite"
              class="bl-frame"
              :title="formatFrame(query.callSite.file, query.callSite.line)"
            ><bdi>{{ formatFrame(query.callSite.file, query.callSite.line) }}</bdi></span>
          </div>
          <code class="bl-sql">{{ query.sql }}</code>
          <div
            v-if="query.bindings?.length"
            class="bl-muted bl-bindings"
          >
            bindings: {{ query.bindings.map(formatValue).join(', ') }}
          </div>
        </li>
        <li
          v-if="!details.queries.length"
          class="bl-empty"
        >
          No queries.
        </li>
      </ol>

      <ol
        v-else-if="activeTab === 'logs'"
        class="bl-logs"
        data-testid="backend-lens-logs"
      >
        <li
          v-for="(entryLog, index) in details.logs"
          :key="index"
          class="bl-log"
          :class="`bl-level-${entryLog.level}`"
        >
          <span class="bl-level">{{ entryLog.level }}</span>
          <span class="bl-log-message">{{ entryLog.message }}</span>
          <code
            v-if="entryLog.context !== undefined"
            class="bl-muted bl-context"
          >{{ formatValue(entryLog.context) }}</code>
        </li>
        <li
          v-if="!details.logs.length"
          class="bl-empty"
        >
          No log entries.
        </li>
      </ol>
    </template>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RequestEntry } from '../core/types'
import { formatBytes, formatFrame, formatMs, formatValue, statusClass } from './format'
import { useLensUiState } from './state'

const props = defineProps<{
  entry: RequestEntry
}>()

const emit = defineEmits<{
  reload: []
}>()

const { lens } = useLensUiState()
const slowQueryMs = lens.options.slowQueryMs

type TabId = 'queries' | 'logs'
const activeTab = ref<TabId>('queries')

const details = computed(() => props.entry.details)

const tabs = computed(() => [
  { id: 'queries' as const, label: 'Queries', count: details.value?.queries.length ?? 0 },
  { id: 'logs' as const, label: 'Logs', count: details.value?.logs.length ?? 0 },
])
</script>
