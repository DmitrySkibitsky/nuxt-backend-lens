<template>
  <ol
    class="bl-logs"
    data-testid="backend-lens-logs"
  >
    <li
      v-for="(entry, index) in logs"
      :key="index"
      class="bl-log"
      :class="`bl-level-${entry.level}`"
    >
      <span class="bl-level">{{ entry.level }}</span>
      <span class="bl-log-message">{{ entry.message }}</span>
      <code
        v-if="entry.context !== undefined"
        class="bl-muted bl-context"
      >{{ formatValue(entry.context) }}</code>
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
import type { DebugLogEntry } from '../core/types'
import { formatValue } from './format'

defineProps<{
  logs: readonly DebugLogEntry[]
}>()
</script>
