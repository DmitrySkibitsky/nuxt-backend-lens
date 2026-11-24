<template>
  <div class="bl-query-head">
    <span class="bl-muted">#{{ index + 1 }}</span>
    <span class="bl-duration">{{ formatMs(query.durationMs) }}</span>
    <slot />
    <span
      v-if="query.callSite"
      class="bl-frame"
      :title="formatFrame(query.callSite.file, query.callSite.line)"
    ><SourceLink :location="query.callSite"><bdi>{{ formatFrame(query.callSite.file, query.callSite.line) }}</bdi></SourceLink></span>
  </div>
  <SqlCode
    :sql="query.sql"
    :options="sqlOptions"
  />
  <div
    v-if="query.bindings?.length"
    class="bl-muted bl-bindings"
  >
    bindings: {{ query.bindings.map(formatValue).join(', ') }}
  </div>
</template>

<script setup lang="ts">
import type { SqlDisplayOptions } from '../core/options'
import type { DebugQuery } from '../core/types'
import { formatFrame, formatMs, formatValue } from './format'
import SourceLink from './SourceLink.vue'
import SqlCode from './SqlCode.vue'

defineProps<{
  query: DebugQuery
  index: number
  sqlOptions: SqlDisplayOptions
}>()
</script>
