<template>
  <div>
    <h1>Timing only (no debug package)</h1>
    <p class="hint">
      <code>/api/timing-only</code> is excluded from Clockwork and Debugbar and sends its own
      <code>Server-Timing</code> header, like a Rails, Django or Go backend would. The lens falls back
      to its server-timing adapter: server and database time, no queries.
    </p>
    <button @click="refresh()">
      Run again
    </button>
    <ResultBlock
      :data="data"
      :error="error"
      :pending="pending"
    />
  </div>
</template>

<script setup lang="ts">
const { data, pending, error, refresh } = await useFetch('/api/timing-only', { key: 'timing-only' })
</script>
