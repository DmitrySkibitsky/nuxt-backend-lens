<template>
  <div>
    <h1>Cross-origin API</h1>
    <p>
      Open this page on the cross-origin entry (<code>CROSS_ORIGIN_PORT</code>, default
      <a :href="crossOriginHref">localhost:18081</a>). It calls the backend directly on
      <code>{{ api || '(not configured)' }}</code>, a different origin. The lens can only read the debug
      id and the record because the backend exposes the headers and allows the record endpoints via CORS.
    </p>
    <p>
      Current origin: <code data-testid="origin">{{ origin }}</code>
    </p>
    <button
      data-testid="run"
      @click="run"
    >
      Run
    </button>
    <ResultBlock
      :data="result"
      :error="error"
      :pending="pending"
    />
  </div>
</template>

<script setup lang="ts">
const api = useRuntimeConfig().public.crossOriginApi as string
const origin = window.location.origin
const crossOriginHref = 'http://localhost:18081/cross-origin'

const result = ref<unknown>()
const error = ref<unknown>()
const pending = ref(false)

async function run() {
  pending.value = true
  error.value = undefined
  try {
    const books = await $fetch<{ data: unknown[] }>('/api/books', { baseURL: api, credentials: 'include' })
    const logs = await (await fetch(`${api}/api/logs`, { credentials: 'include', headers: { Accept: 'application/json' } })).json()
    result.value = { books: books.data.length, logs }
  }
  catch (caught) {
    error.value = caught
  }
  finally {
    pending.value = false
  }
}
</script>
