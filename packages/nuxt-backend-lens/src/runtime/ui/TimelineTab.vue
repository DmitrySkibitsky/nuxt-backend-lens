<template>
  <div data-testid="backend-lens-timeline">
    <p
      v-if="!waterfall.rows.length"
      class="bl-empty"
    >
      No timeline data.
    </p>
    <template v-else>
      <div class="bl-axis bl-muted">
        <span>0</span>
        <span>{{ formatMs(waterfall.totalMs / 2) }}</span>
        <span>{{ formatMs(waterfall.totalMs) }}</span>
      </div>
      <ol class="bl-waterfall">
        <li
          v-for="(row, index) in waterfall.rows"
          :key="index"
          class="bl-waterfall-row"
          :class="`bl-waterfall-${row.kind}`"
          :title="`${row.label} — ${formatMs(row.durationMs)} at ${formatMs(row.startMs)}`"
        >
          <span class="bl-waterfall-label">{{ row.kind === 'query' ? `#${(row.queryIndex ?? 0) + 1} ${row.label}` : row.label }}</span>
          <span class="bl-waterfall-track">
            <span
              class="bl-waterfall-bar"
              :style="barStyle(row.startMs, row.durationMs)"
            />
          </span>
          <span class="bl-waterfall-time">{{ formatMs(row.durationMs) }}</span>
        </li>
      </ol>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { buildWaterfall } from '../core/analysis'
import type { DebugDetails } from '../core/types'
import { formatMs } from './format'

const props = defineProps<{
  details: DebugDetails
}>()

const waterfall = computed(() => buildWaterfall(props.details))

/** Bars keep a minimal visible width so sub-millisecond queries still show up. */
function barStyle(startMs: number, durationMs: number): Record<string, string> {
  const total = waterfall.value.totalMs || 1
  const left = Math.min(100, (startMs / total) * 100)
  const width = Math.max(0.4, Math.min(100 - left, (durationMs / total) * 100))
  return { left: `${left}%`, width: `${width}%` }
}
</script>
