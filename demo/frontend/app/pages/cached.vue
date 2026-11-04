<template>
  <div>
    <h1>Cache</h1>
    <p class="hint">
      "Fresh" clears the key (miss + write); "Cached" reads it again (hit).
    </p>
    <button @click="load(true)">
      Fresh (miss)
    </button>
    <button @click="load(false)">
      Cached (hit)
    </button>
    <ResultBlock
      :data="data"
      :error="error"
      :pending="pending"
    />
  </div>
</template>

<script setup lang="ts">
const data = ref<unknown>()
const error = ref<unknown>()
const pending = ref(false)

async function load(fresh: boolean) {
  pending.value = true
  error.value = undefined
  try {
    data.value = await $fetch('/api/cached', { query: fresh ? { fresh: 1 } : {} })
  }
  catch (caught) {
    error.value = caught
  }
  finally {
    pending.value = false
  }
}

onMounted(async () => {
  await load(true)
  await load(false)
})
</script>
