<template>
  <div>
    <h1>HTTP clients</h1>
    <p class="hint">
      The same <code>GET /api/stats</code> through six different clients. The module must capture every
      one of them, because it patches <code>fetch</code> and <code>XMLHttpRequest</code> underneath.
    </p>
    <button @click="runAll">Run all</button>
    <table>
      <thead><tr><th>Client</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-for="client in clients" :key="client.name">
          <td><code>{{ client.name }}</code></td>
          <td :class="{ error: results[client.name]?.startsWith('error') }">{{ results[client.name] ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios'

const url = '/api/stats'
const sanctumClient = useSanctumClient()
const { execute: executeUseFetch } = useFetch(url, { key: 'clients-use-fetch', immediate: false })

function xhrGet(target: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('GET', target)
    request.setRequestHeader('Accept', 'application/json')
    request.onload = () => resolve(request.status)
    request.onerror = () => reject(new Error('network error'))
    request.send()
  })
}

const clients: { name: string, run: () => Promise<unknown> }[] = [
  { name: '$fetch', run: () => $fetch(url) },
  { name: 'useFetch', run: () => executeUseFetch() },
  { name: 'useSanctumClient', run: () => sanctumClient(url) },
  { name: 'window.fetch', run: () => fetch(url, { headers: { Accept: 'application/json' } }) },
  { name: 'axios', run: () => axios.get(url) },
  { name: 'XMLHttpRequest', run: () => xhrGet(url) },
]

const results = reactive<Record<string, string>>({})

async function runAll() {
  await Promise.all(clients.map(async (client) => {
    results[client.name] = 'running'
    try {
      await client.run()
      results[client.name] = 'ok'
    }
    catch (error) {
      results[client.name] = `error: ${(error as Error).message}`
    }
  }))
}

onMounted(runAll)
</script>
