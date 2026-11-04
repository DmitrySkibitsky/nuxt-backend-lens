<template>
  <div>
    <ul
      v-if="analysis.issues.length"
      class="bl-issues"
      data-testid="backend-lens-issues"
    >
      <li
        v-for="(issue, index) in analysis.issues"
        :key="index"
      >
        <button
          type="button"
          class="bl-issue"
          :class="[`bl-issue-${issueClass(issue.kind)}`, { 'bl-issue-active': focused === index }]"
          :data-testid="`backend-lens-issue-${issueClass(issue.kind)}`"
          @click="focused = focused === index ? undefined : index"
        >
          <span class="bl-chip">{{ ISSUE_LABELS[issue.kind] }}</span>
          <span v-if="issue.kind === 'n+1'">
            {{ issue.indexes.length }}× <code>{{ issue.pattern }}</code>
            <span
              v-if="issue.callSite"
              class="bl-muted"
            > from {{ formatFrame(issue.callSite.file, issue.callSite.line) }}</span>
          </span>
          <span v-else-if="issue.kind === 'duplicate'">
            {{ issue.indexes.length }}× identical <code>{{ issue.sql }}</code>
          </span>
          <span v-else>
            <code>{{ issue.sql }}</code>
          </span>
          <span class="bl-issue-time">{{ formatMs(issue.totalMs) }}</span>
        </button>
      </li>
    </ul>

    <p
      v-if="focusedIssue"
      class="bl-muted bl-filter-note"
    >
      Showing {{ visibleQueries.length }} of {{ queries.length }} queries.
      <button
        type="button"
        class="bl-button"
        @click="focused = undefined"
      >
        Show all
      </button>
    </p>

    <ol
      class="bl-queries"
      data-testid="backend-lens-queries"
    >
      <li
        v-for="{ query, index } in visibleQueries"
        :key="index"
        class="bl-query"
        :class="{ 'bl-slow': query.durationMs >= slowQueryMs, 'bl-flagged': flagged.has(index) }"
      >
        <div class="bl-query-head">
          <span class="bl-muted">#{{ index + 1 }}</span>
          <span class="bl-duration">{{ formatMs(query.durationMs) }}</span>
          <span
            v-for="kind in flagged.get(index) ?? []"
            :key="kind"
            class="bl-chip"
            :class="`bl-issue-${issueClass(kind)}`"
          >{{ ISSUE_LABELS[kind] }}</span>
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
        v-if="!queries.length"
        class="bl-empty"
      >
        No queries.
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { QueryIssue, RequestAnalysis } from '../core/analysis'
import type { DebugQuery } from '../core/types'
import { formatFrame, formatMs, formatValue, ISSUE_LABELS } from './format'

const props = defineProps<{
  queries: readonly DebugQuery[]
  analysis: RequestAnalysis
  slowQueryMs: number
}>()

const focused = ref<number>()
watch(() => props.queries, () => {
  focused.value = undefined
})

const focusedIssue = computed(() => (focused.value === undefined ? undefined : props.analysis.issues[focused.value]))

const visibleQueries = computed(() => {
  const all = props.queries.map((query, index) => ({ query, index }))
  if (!focusedIssue.value) {
    return all
  }
  const indexes = new Set<number>(focusedIssue.value.indexes)
  return all.filter(item => indexes.has(item.index))
})

/** Query index → kinds of N+1 / duplicate issues it belongs to (slow is shown by highlighting). */
const flagged = computed(() => {
  const map = new Map<number, QueryIssue['kind'][]>()
  for (const issue of props.analysis.issues) {
    if (issue.kind === 'slow') {
      continue
    }
    for (const index of issue.indexes) {
      map.set(index, [...(map.get(index) ?? []), issue.kind])
    }
  }
  return map
})

function issueClass(kind: QueryIssue['kind']): string {
  return kind === 'n+1' ? 'n-plus-one' : kind
}
</script>
