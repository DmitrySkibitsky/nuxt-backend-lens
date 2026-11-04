<template>
  <main>
    <h1>packaged module check</h1>
    <p data-testid="status">
      {{ status }}
    </p>
  </main>
</template>

<script setup lang="ts">
const status = ref('loading')

onMounted(async () => {
  await $fetch('/api/books')
  status.value = 'loaded'
})
</script>
