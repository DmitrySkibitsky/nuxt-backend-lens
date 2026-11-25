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
        >
          <component
            :is="row.queryIndex === undefined ? 'div' : 'button'"
            class="bl-waterfall-line"
            :type="row.queryIndex === undefined ? undefined : 'button'"
            :aria-expanded="row.queryIndex === undefined ? undefined : expanded.has(row.queryIndex)"
            :data-testid="row.queryIndex === undefined ? undefined : 'backend-lens-timeline-toggle'"
            :title="`${row.label} — ${formatMs(row.durationMs)} at ${formatMs(row.startMs)}`"
            @click="row.queryIndex !== undefined && toggle(row.queryIndex)"
          >
            <span
              v-if="row.queryIndex === undefined"
              class="bl-waterfall-label"
            >{{ row.label }}</span>
            <span
              v-else
              class="bl-waterfall-label"
            >#{{ row.queryIndex + 1 }} <SqlCode
              :sql="row.label"
              :options="sqlOptions"
              inline
            /></span>
            <span class="bl-waterfall-track">
              <span
                class="bl-waterfall-bar"
                :style="barStyle(row.startMs, row.durationMs)"
              />
            </span>
            <span class="bl-waterfall-time">{{ formatMs(row.durationMs) }}</span>
          </component>
          <div
            v-if="row.queryIndex !== undefined && expanded.has(row.queryIndex) && details.queries[row.queryIndex]"
            class="bl-group-members bl-waterfall-details"
            data-testid="backend-lens-timeline-query"
          >
            <div
              class="bl-query"
              :class="{ 'bl-slow': details.queries[row.queryIndex]!.durationMs >= slowQueryMs }"
            >
              <QueryRow
                :query="details.queries[row.queryIndex]!"
                :index="row.queryIndex"
                :sql-options="sqlOptions"
              />
            </div>
          </div>
        </li>
      </ol>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { buildWaterfall } from '../core/analysis'
import type { SqlDisplayOptions } from '../core/options'
import type { DebugDetails } from '../core/types'
import { formatMs } from './format'
import QueryRow from './QueryRow.vue'
import SqlCode from './SqlCode.vue'

const props = defineProps<{
  details: DebugDetails
  slowQueryMs: number
  sqlOptions: SqlDisplayOptions
}>()

const waterfall = computed(() => buildWaterfall(props.details))

/** Query indexes whose statement is open below their bar. */
const expanded = ref(new Set<number>())

watch(() => props.details, () => {
  expanded.value = new Set()
})

function toggle(queryIndex: number) {
  const next = new Set(expanded.value)
  if (!next.delete(queryIndex)) {
    next.add(queryIndex)
  }
  expanded.value = next
}

/** Bars keep a minimal visible width so sub-millisecond queries still show up. */
function barStyle(startMs: number, durationMs: number): Record<string, string> {
  const total = waterfall.value.totalMs || 1
  const left = Math.min(100, (startMs / total) * 100)
  const width = Math.max(0.4, Math.min(100 - left, (durationMs / total) * 100))
  return { left: `${left}%`, width: `${width}%` }
}
</script>
