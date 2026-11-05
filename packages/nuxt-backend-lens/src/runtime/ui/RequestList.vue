<template>
  <ul class="bl-list">
    <template
      v-for="(entry, index) in entries"
      :key="entry.key"
    >
      <li
        v-if="startsActionGroup(index)"
        class="bl-action"
        data-testid="backend-lens-action"
        :title="`Requests started within ${lens.options.actions.windowMs} ms of this action`"
      >
        <span aria-hidden="true">⚡</span> {{ actionLabel(entry) }}
      </li>
      <li>
        <button
          type="button"
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
            <span v-if="entry.detailsState === 'loaded' && (queryCount(entry) || !entry.details?.note)">{{ queryCount(entry) }} q</span>
            <span
              v-else-if="entry.detailsState === 'loaded'"
              class="bl-muted"
            >timing only</span>
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
            <span v-if="databaseMs(entry, lens.options) !== undefined">{{ formatMs(databaseMs(entry, lens.options)) }} DB</span>
            <span
              v-for="chip in chips(entry)"
              :key="chip.kind"
              class="bl-chip"
              :class="`bl-issue-${chip.kind}`"
              :data-testid="`backend-lens-chip-${chip.kind}`"
            >{{ chip.label }}</span>
          </span>
          <span
            v-if="showNavigation"
            class="bl-muted bl-nav"
          >#{{ entry.navigationId }}</span>
        </button>
      </li>
    </template>
  </ul>
</template>

<script setup lang="ts">
import { analyzeDetails } from '../core/analysis'
import type { RequestEntry } from '../core/types'
import { analysisOptions, databaseMs, formatAction, formatMs, queryCount, statusClass } from './format'
import { useLensUiState } from './state'

const props = defineProps<{
  entries: readonly RequestEntry[]
  selectedKey?: number
  showNavigation: boolean
}>()

const emit = defineEmits<{
  select: [key: number]
}>()

const { lens, actions } = useLensUiState()

/** A header goes above the first request of each run of requests sharing an action. */
function startsActionGroup(index: number): boolean {
  const actionId = props.entries[index]!.actionId
  return actionId !== undefined && actionId !== props.entries[index - 1]?.actionId
}

function actionLabel(entry: RequestEntry): string {
  const action = actions.value.find(item => item.id === entry.actionId)
  return action ? formatAction(action) : 'action'
}

function chips(entry: RequestEntry): { kind: string, label: string }[] {
  if (!entry.details) {
    return []
  }
  const analysis = analyzeDetails(entry.details, analysisOptions(lens.options))
  return [
    analysis.nPlusOne && { kind: 'n-plus-one', label: 'N+1' },
    analysis.duplicates && { kind: 'duplicate', label: `${analysis.duplicates} dup` },
    analysis.slow && { kind: 'slow', label: 'slow' },
  ].filter((chip): chip is { kind: string, label: string } => Boolean(chip))
}
</script>
