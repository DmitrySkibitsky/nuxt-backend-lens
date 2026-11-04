<template>
  <div
    class="bl-root"
    :class="`bl-pos-${lens.options.toolbar.position}`"
  >
    <button
      v-if="!open"
      type="button"
      class="bl-badge"
      :class="{ 'bl-badge-problem': problems > 0 }"
      data-testid="backend-lens-badge"
      title="Backend Lens"
      @click="open = true"
    >
      <span class="bl-badge-title">Backend</span>
      <span data-testid="backend-lens-badge-requests">{{ visible.length }} req</span>
      <span data-testid="backend-lens-badge-queries">{{ totals.queries }} q</span>
      <span>{{ formatMs(totals.databaseMs) }} DB</span>
      <span
        v-if="problems > 0"
        class="bl-badge-alert"
      >{{ problems }} ✕</span>
    </button>

    <section
      v-else
      class="bl-panel"
      data-testid="backend-lens-panel"
      aria-label="Backend Lens"
    >
      <header class="bl-panel-header">
        <strong>Backend Lens</strong>
        <span class="bl-muted">{{ scopeLabel }}</span>
        <span class="bl-spacer" />
        <label class="bl-toggle">
          <input
            v-model="showAll"
            type="checkbox"
          >
          all navigations
        </label>
        <button
          type="button"
          class="bl-button"
          @click="clear"
        >
          Clear
        </button>
        <button
          type="button"
          class="bl-button"
          aria-label="Close"
          @click="open = false"
        >
          ✕
        </button>
      </header>
      <div class="bl-panel-body">
        <RequestList
          :entries="visible"
          :selected-key="selectedKey"
          :show-navigation="showAll"
          @select="select"
        />
        <RequestDetails
          v-if="selected"
          :entry="selected"
          @reload="lens.load(selected.key)"
        />
        <p
          v-else
          class="bl-empty"
        >
          {{ visible.length ? 'Select a request.' : 'No backend requests in this navigation yet.' }}
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatMs, hasProblem } from './format'
import RequestDetails from './RequestDetails.vue'
import RequestList from './RequestList.vue'
import { useLensUiState } from './state'

const { lens, entries, navigations, currentNavigationId } = useLensUiState()

const open = ref(lens.options.toolbar.open)
const showAll = ref(false)
const selectedKey = ref<number>()

const visible = computed(() => (showAll.value
  ? entries.value
  : entries.value.filter(entry => entry.navigationId === currentNavigationId.value)))

const selected = computed(() => entries.value.find(entry => entry.key === selectedKey.value))

const totals = computed(() => visible.value.reduce(
  (sum, entry) => ({
    queries: sum.queries + (entry.details?.queries.length ?? 0),
    databaseMs: sum.databaseMs + (entry.details?.queriesDurationMs ?? 0),
  }),
  { queries: 0, databaseMs: 0 },
))

const problems = computed(() => visible.value.filter(hasProblem).length)

const scopeLabel = computed(() => {
  if (showAll.value) {
    return `${entries.value.length} requests`
  }
  const route = navigations.value.find(item => item.id === currentNavigationId.value)?.route
  return route ? `on ${route}` : ''
})

function select(key: number) {
  selectedKey.value = key
  const entry = entries.value.find(item => item.key === key)
  if (entry && (entry.detailsState === 'idle' || entry.detailsState === 'error')) {
    void lens.load(key)
  }
}

function clear() {
  selectedKey.value = undefined
  lens.clear()
}
</script>
