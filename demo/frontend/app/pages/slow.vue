<template>
  <div>
    <h1>Slow query</h1>
    <p class="hint">One query that takes about 300 ms.</p>
    <button @click="refresh()">Run again</button>
    <ResultBlock :data="data" :error="error" :pending="pending" />
  </div>
</template>

<script setup lang="ts">
const { data, pending, error, refresh } = await useFetch('/api/slow', { key: 'slow' })
</script>
