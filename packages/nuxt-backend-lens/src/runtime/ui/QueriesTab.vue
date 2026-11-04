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
          :class="`bl-issue-${issueClass(issue.kind)}`"
          :data-testid="`backend-lens-issue-${issueClass(issue.kind)}`"
          :title="issueTitle(issue)"
          :aria-expanded="issue.kind === 'slow' ? undefined : expanded.has(issue.indexes[0]!)"
          @click="onIssue(issue)"
        >
          <span class="bl-chip">{{ ISSUE_LABELS[issue.kind] }}</span>
          <span v-if="issue.kind === 'n+1'">
            {{ issue.indexes.length }}× <SqlCode
              :sql="issue.pattern"
              :options="sqlOptions"
              inline
            />
            <span
              v-if="issue.callSite"
              class="bl-muted"
            > from {{ formatFrame(issue.callSite.file, issue.callSite.line) }}</span>
          </span>
          <span v-else-if="issue.kind === 'duplicate'">
            {{ issue.indexes.length }}× identical <SqlCode
              :sql="issue.sql"
              :options="sqlOptions"
              inline
            />
          </span>
          <span v-else>
            <SqlCode
              :sql="issue.sql"
              :options="sqlOptions"
              inline
            />
          </span>
          <span class="bl-issue-time">{{ formatMs(issue.totalMs) }}</span>
        </button>
      </li>
    </ul>

    <ol
      ref="list"
      class="bl-queries"
      data-testid="backend-lens-queries"
    >
      <template
        v-for="row in rows"
        :key="row.index"
      >
        <li
          class="bl-query"
          :class="{ 'bl-slow': row.query.durationMs >= slowQueryMs, 'bl-flash': flashed === row.index }"
          :data-index="row.index"
          data-testid="backend-lens-query"
        >
          <QueryRow
            :query="row.query"
            :index="row.index"
            :sql-options="sqlOptions"
          >
            <button
              v-if="row.group"
              type="button"
              class="bl-chip bl-group-toggle"
              :class="`bl-issue-${issueClass(row.group.kind)}`"
              :aria-expanded="expanded.has(row.index)"
              data-testid="backend-lens-group-toggle"
              @click="toggle(row.index)"
            >
              {{ ISSUE_LABELS[row.group.kind] }} ×{{ row.group.indexes.length }}
              · {{ expanded.has(row.index) ? 'hide' : `show ${row.group.indexes.length - 1} more` }}
            </button>
          </QueryRow>

          <ol
            v-if="row.group && expanded.has(row.index)"
            class="bl-group-members"
            :class="`bl-group-${issueClass(row.group.kind)}`"
            data-testid="backend-lens-group-members"
          >
            <li
              v-for="member in row.group.indexes.slice(1)"
              :key="member"
              class="bl-query bl-group-member"
              :class="{ 'bl-slow': queries[member]!.durationMs >= slowQueryMs }"
              :data-index="member"
              data-testid="backend-lens-query"
            >
              <QueryRow
                :query="queries[member]!"
                :index="member"
                :sql-options="sqlOptions"
              />
            </li>
          </ol>
        </li>
      </template>
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
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import type { QueryIssue, RequestAnalysis } from '../core/analysis'
import type { SqlDisplayOptions } from '../core/options'
import type { DebugQuery } from '../core/types'
import { formatFrame, formatMs, ISSUE_LABELS } from './format'
import QueryRow from './QueryRow.vue'
import SqlCode from './SqlCode.vue'

const props = defineProps<{
  queries: readonly DebugQuery[]
  analysis: RequestAnalysis
  slowQueryMs: number
  sqlOptions: SqlDisplayOptions
}>()

type GroupIssue = Extract<QueryIssue, { kind: 'n+1' | 'duplicate' }>

/**
 * N+1 and duplicate groups are disjoint (the analysis never puts a query in both), so each group
 * collapses into its first query; the other members open right below it.
 */
const rows = computed(() => {
  const groupByLead = new Map<number, GroupIssue>()
  const members = new Set<number>()
  for (const issue of props.analysis.issues) {
    if (issue.kind === 'slow') {
      continue
    }
    groupByLead.set(issue.indexes[0]!, issue)
    issue.indexes.slice(1).forEach(index => members.add(index))
  }
  return props.queries
    .map((query, index) => ({ query, index, group: groupByLead.get(index) }))
    .filter(row => !members.has(row.index))
})

const expanded = ref(new Set<number>())
const flashed = ref<number>()
const list = useTemplateRef<HTMLOListElement>('list')

watch(() => props.queries, () => {
  expanded.value = new Set()
  flashed.value = undefined
})

function toggle(lead: number) {
  const next = new Set(expanded.value)
  if (next.has(lead)) {
    next.delete(lead)
  }
  else {
    next.add(lead)
  }
  expanded.value = next
}

/** From the issues summary: a group toggles like its own chip; opening (or a slow query) scrolls to it. */
function onIssue(issue: QueryIssue) {
  const lead = issue.indexes[0]!
  if (issue.kind !== 'slow' && expanded.value.has(lead)) {
    toggle(lead)
    return
  }
  if (issue.kind !== 'slow') {
    toggle(lead)
  }
  void reveal(lead)
}

function issueTitle(issue: QueryIssue): string {
  if (issue.kind === 'slow') {
    return 'Scroll to the query'
  }
  return expanded.value.has(issue.indexes[0]!) ? 'Hide the group' : 'Show the group in the list below'
}

/** Brings a query into view and flashes it. */
async function reveal(lead: number) {
  flashed.value = lead
  await nextTick()
  list.value?.querySelector(`[data-index="${lead}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  setTimeout(() => {
    if (flashed.value === lead) {
      flashed.value = undefined
    }
  }, 1200)
}

function issueClass(kind: QueryIssue['kind']): string {
  return kind === 'n+1' ? 'n-plus-one' : kind
}
</script>
