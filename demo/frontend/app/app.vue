<template>
  <div class="layout">
    <nav>
      <strong>nuxt-backend-lens demo</strong>
      <NuxtLink v-for="link in links" :key="link.to" :to="link.to">{{ link.label }}</NuxtLink>
    </nav>
    <main>
      <NuxtPage />
    </main>
  </div>
</template>

<script setup lang="ts">
const links = [
  { to: '/', label: 'Overview' },
  { to: '/books', label: 'N+1: books' },
  { to: '/stats', label: 'Duplicate queries' },
  { to: '/slow', label: 'Slow query' },
  { to: '/cached', label: 'Cache' },
  { to: '/logs', label: 'Logs' },
  { to: '/boom', label: 'Exception' },
  { to: '/reviews', label: 'Write + auth' },
  { to: '/clients', label: 'HTTP clients' },
  { to: '/everything', label: 'Everything at once' },
  { to: '/cross-origin', label: 'Cross-origin API' },
  { to: '/timing-only', label: 'Timing only' },
]
</script>
