<template>
  <div>
    <h1>nuxt-backend-lens demo</h1>
    <p>
      Every page in the sidebar calls a Laravel endpoint that produces one kind of debug data.
      The SPA and the API share this origin through the proxy, so each response's
      <code>X-Clockwork-Id</code> is readable from JS.
    </p>
    <table>
      <thead>
        <tr><th>Page</th><th>Endpoint</th><th>Expected debug data</th></tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.page"
        >
          <td><NuxtLink :to="row.page">{{ row.page }}</NuxtLink></td>
          <td><code>{{ row.endpoint }}</code></td>
          <td>{{ row.expected }}</td>
        </tr>
      </tbody>
    </table>
    <p class="hint">
      Raw Clockwork UI: <a
        href="/clockwork/app"
        target="_blank"
      >/clockwork/app</a>.
      Demo login: <code>demo@example.com</code> / <code>password</code>.
    </p>
  </div>
</template>

<script setup lang="ts">
const rows = [
  { page: '/books', endpoint: 'GET /api/books[?eager=1]', expected: 'N+1: 31 queries vs 2 with eager loading' },
  { page: '/stats', endpoint: 'GET /api/stats', expected: 'identical count queries repeated' },
  { page: '/slow', endpoint: 'GET /api/slow', expected: 'one ~300 ms query' },
  { page: '/cached', endpoint: 'GET /api/cached', expected: 'cache miss + write, then hit' },
  { page: '/logs', endpoint: 'GET /api/logs', expected: 'debug / info / warning / error log entries' },
  { page: '/boom', endpoint: 'GET /api/boom', expected: '500 with exception' },
  { page: '/reviews', endpoint: 'POST /api/books/{id}/reviews', expected: 'insert, event, queued job; Sanctum auth' },
  { page: '/clients', endpoint: 'GET /api/stats ×6', expected: 'same request via six different HTTP clients' },
  { page: '/everything', endpoint: 'all of the above', expected: 'parallel requests from one navigation' },
  { page: '/timing-only', endpoint: 'GET /api/timing-only', expected: 'Server-Timing only, no debug package' },
]
</script>
