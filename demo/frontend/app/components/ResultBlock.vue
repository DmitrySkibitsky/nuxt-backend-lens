<template>
  <section>
    <p v-if="pending" class="hint">Loading…</p>
    <p v-else-if="error" class="error">Error: {{ errorMessage }}</p>
    <pre v-else-if="data !== undefined && data !== null">{{ data }}</pre>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{
  data?: unknown
  error?: unknown
  pending?: boolean
}>()

const errorMessage = computed(() => {
  const error = props.error as { statusCode?: number, message?: string } | null | undefined
  if (!error) return ''
  return error.statusCode ? `HTTP ${error.statusCode} — ${error.message}` : String(error.message ?? error)
})
</script>
