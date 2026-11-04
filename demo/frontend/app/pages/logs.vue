<template>
  <div>
    <h1>Logs</h1>
    <p class="hint">The backend writes debug, info, warning and error entries.</p>
    <button @click="refresh()">Run again</button>
    <ResultBlock :data="data" :error="error" :pending="pending" />
  </div>
</template>

<script setup lang="ts">
const { data, pending, error, refresh } = await useFetch('/api/logs', { key: 'logs' })
</script>
