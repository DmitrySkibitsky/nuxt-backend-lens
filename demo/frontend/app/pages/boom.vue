<template>
  <div>
    <h1>Exception</h1>
    <p class="hint">
      The endpoint runs one query and then throws, ending in a 500.
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
const { data, pending, error, refresh } = await useFetch('/api/boom', { key: 'boom' })
</script>
