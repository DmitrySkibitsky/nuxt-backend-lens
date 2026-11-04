<template>
  <div>
    <h1>Everything at once</h1>
    <p class="hint">One navigation, many parallel backend requests — the grouping-by-navigation case.</p>
    <button @click="runAll">Run again</button>
    <table>
      <thead><tr><th>Endpoint</th><th>Result</th></tr></thead>
      <tbody>
        <tr v-for="endpoint in endpoints" :key="endpoint">
          <td><code>{{ endpoint }}</code></td>
          <td :class="{ error: results[endpoint]?.startsWith('error') }">{{ results[endpoint] ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
const endpoints = [
  '/api/books',
  '/api/books?eager=1',
  '/api/stats',
  '/api/slow',
  '/api/cached',
  '/api/logs',
  '/api/boom',
]

const results = reactive<Record<string, string>>({})

async function runAll() {
  await Promise.all(endpoints.map(async (endpoint) => {
    results[endpoint] = 'running'
    try {
      await $fetch(endpoint)
      results[endpoint] = 'ok'
    }
    catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      results[endpoint] = `error: HTTP ${status ?? '?'}`
    }
  }))
}

onMounted(runAll)
</script>
