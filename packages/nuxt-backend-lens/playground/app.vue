<template>
  <main style="font-family: system-ui, sans-serif; padding: 1rem 2rem">
    <h1>nuxt-backend-lens playground</h1>
    <p>
      Requests below hit a mock backend that replays records captured from the demo stand.
      Source:
      <label><input
        v-model="source"
        type="radio"
        value="clockwork"
      > Clockwork</label>
      <label><input
        v-model="source"
        type="radio"
        value="debugbar"
      > Debugbar</label>
    </p>
    <p>
      <button
        v-for="scenario in scenarios"
        :key="scenario"
        style="margin: 0 .5rem .5rem 0"
        @click="call(scenario)"
      >
        {{ scenario }}
      </button>
      <button @click="callAll">
        all at once
      </button>
    </p>
  </main>
</template>

<script setup lang="ts">
const scenarios = [
  '/api/books',
  '/api/books?eager=1',
  '/api/stats',
  '/api/slow',
  '/api/cached?fresh=1',
  '/api/cached',
  '/api/logs',
  '/api/boom',
]

const source = ref<'clockwork' | 'debugbar'>('clockwork')

function call(path: string) {
  const separator = path.includes('?') ? '&' : '?'
  return $fetch(`${path}${separator}source=${source.value}`).catch(() => undefined)
}

function callAll() {
  return Promise.all(scenarios.map(call))
}
</script>
