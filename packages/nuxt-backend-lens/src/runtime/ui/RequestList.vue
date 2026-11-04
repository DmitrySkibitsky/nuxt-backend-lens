<template>
  <div
    class="bl-list"
    role="list"
  >
    <button
      v-for="entry in entries"
      :key="entry.key"
      type="button"
      role="listitem"
      class="bl-list-item"
      :class="{ 'bl-selected': entry.key === selectedKey }"
      :data-testid="`backend-lens-request-${entry.key}`"
      :title="entry.url"
      @click="emit('select', entry.key)"
    >
      <span class="bl-method">{{ entry.method }}</span>
      <span class="bl-path">{{ entry.path }}</span>
      <span
        class="bl-status"
        :class="statusClass(entry.status)"
      >{{ entry.status }}</span>
      <span class="bl-metrics">
        <span>{{ formatMs(entry.durationMs) }}</span>
        <span v-if="entry.detailsState === 'loaded'">{{ queryCount(entry) }} q</span>
        <span
          v-else-if="entry.detailsState === 'loading'"
          class="bl-muted"
        >…</span>
        <span
          v-else-if="entry.detailsState === 'none'"
          class="bl-muted"
        >no debug data</span>
        <span
          v-else-if="entry.detailsState === 'error'"
          class="bl-status-error"
        >!</span>
        <span v-if="databaseMs(entry) !== undefined">{{ formatMs(databaseMs(entry)) }} DB</span>
      </span>
      <span
        v-if="showNavigation"
        class="bl-muted bl-nav"
      >#{{ entry.navigationId }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { RequestEntry } from '../core/types'
import { databaseMs, formatMs, queryCount, statusClass } from './format'

defineProps<{
  entries: readonly RequestEntry[]
  selectedKey?: number
  showNavigation: boolean
}>()

const emit = defineEmits<{
  select: [key: number]
}>()
</script>
