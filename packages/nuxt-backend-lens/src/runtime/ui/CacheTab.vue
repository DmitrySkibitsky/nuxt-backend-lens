<template>
  <div data-testid="backend-lens-cache">
    <p
      v-if="cache.length"
      class="bl-muted"
    >
      <span
        v-for="(count, type) in counts"
        :key="type"
        class="bl-cache-count"
      >{{ type }}: {{ count }}</span>
    </p>
    <table
      v-if="cache.length"
      class="bl-table"
    >
      <thead>
        <tr>
          <th>Event</th>
          <th>Key</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(event, index) in cache"
          :key="index"
          :class="`bl-cache-${event.type}`"
        >
          <td class="bl-cache-type">
            {{ event.type }}
          </td>
          <td><code>{{ event.key }}</code></td>
          <td>{{ formatMs(event.durationMs) }}</td>
        </tr>
      </tbody>
    </table>
    <p
      v-else
      class="bl-empty"
    >
      No cache events.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DebugCacheEvent } from '../core/types'
import { formatMs } from './format'

const props = defineProps<{
  cache: readonly DebugCacheEvent[]
}>()

const counts = computed(() => props.cache.reduce<Record<string, number>>((result, event) => {
  result[event.type] = (result[event.type] ?? 0) + 1
  return result
}, {}))
</script>
