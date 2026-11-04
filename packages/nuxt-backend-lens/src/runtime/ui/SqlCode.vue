<template>
  <code
    class="bl-sql"
    :class="{ 'bl-sql-formatted': formatted !== undefined, 'bl-sql-inline': inline }"
    data-testid="backend-lens-sql"
  ><template v-if="options.highlight"><span
    v-for="(token, index) in tokens"
    :key="index"
    :class="token.type === 'space' || token.type === 'text' ? undefined : `bl-sql-${token.type}`"
  >{{ token.text }}</span></template><template v-else>{{ text }}</template></code>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import type { SqlDisplayOptions } from '../core/options'
import { formatSql, tokenizeSql } from './sql'

const props = defineProps<{
  sql: string
  options: SqlDisplayOptions
  /** One line inside running text (issue summaries): highlighted, never formatted. */
  inline?: boolean
}>()

/** Formatted text once sql-formatter has produced it; until then (or when off) the raw SQL. */
const formatted = ref<string>()

watchEffect((onCleanup) => {
  formatted.value = undefined
  if (!props.options.format || props.inline) {
    return
  }
  let cancelled = false
  onCleanup(() => {
    cancelled = true
  })
  void formatSql(props.sql, { dialect: props.options.dialect }).then((result) => {
    if (!cancelled) {
      formatted.value = result
    }
  })
})

const text = computed(() => formatted.value ?? props.sql)
const tokens = computed(() => tokenizeSql(text.value))
</script>
