<template>
  <div>
    <h1>Duplicate queries</h1>
    <p class="hint">
      Each metric re-runs the same <code>count(*)</code> queries.
    </p>
    <button @click="refresh()">
      Reload
    </button>
    <ResultBlock
      :data="data"
      :error="error"
      :pending="pending"
    />
  </div>
</template>

<script setup lang="ts">
const { data, pending, error, refresh } = await useFetch('/api/stats', { key: 'stats' })
</script>
