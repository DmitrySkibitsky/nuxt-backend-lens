<template>
  <ol
    class="bl-logs"
    data-testid="backend-lens-logs"
  >
    <li
      v-for="(entry, index) in logs"
      :key="index"
      class="bl-log"
      :class="logLevelClass(entry.level)"
    >
      <span class="bl-level">{{ entry.level }}</span>
      <span class="bl-log-message">{{ entry.message }}</span>
      <code
        v-if="entry.context !== undefined"
        class="bl-muted bl-context"
      >{{ formatValue(entry.context) }}</code>
      <span
        v-if="sourceOf(entry)"
        class="bl-muted bl-log-source"
        data-testid="backend-lens-log-source"
      ><SourceLink :location="sourceOf(entry)" /></span>
    </li>
    <li
      v-if="!logs.length"
      class="bl-empty"
    >
      No log entries.
    </li>
  </ol>
</template>

<script setup lang="ts">
import type { DebugLogEntry, SourceLocation } from '../core/types'
import { formatValue, logLevelClass } from './format'
import SourceLink from './SourceLink.vue'

defineProps<{
  logs: readonly DebugLogEntry[]
}>()

/** Where the exception was thrown beats where it was logged (often a framework handler). */
function sourceOf(entry: DebugLogEntry): SourceLocation | undefined {
  if (entry.exception?.file) {
    return { file: entry.exception.file, line: entry.exception.line ?? null }
  }
  return entry.callSite
}
</script>
