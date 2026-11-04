<template>
  <div>
    <h1>N+1: books</h1>
    <p>
      <label><input
        v-model="eager"
        type="checkbox"
      > eager-load authors (<code>?eager=1</code>)</label>
    </p>
    <p class="hint">
      Without eager loading the backend runs 1 + 30 queries; with it, 2.
    </p>
    <p
      v-if="pending"
      class="hint"
    >
      Loading…
    </p>
    <p
      v-else-if="error"
      class="error"
    >
      {{ error.message }}
    </p>
    <table v-else-if="data">
      <thead><tr><th>Title</th><th>Author</th><th>Year</th><th>Rating</th></tr></thead>
      <tbody>
        <tr
          v-for="book in data.data"
          :key="book.id"
        >
          <td>{{ book.title }}</td>
          <td>{{ book.author.name }}</td>
          <td>{{ book.published_year }}</td>
          <td>{{ book.rating }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
interface Book {
  id: number
  title: string
  published_year: number
  rating: string
  author: { id: number, name: string }
}

const eager = ref(false)

const { data, pending, error } = await useFetch<{ data: Book[] }>('/api/books', {
  key: 'books',
  query: computed(() => (eager.value ? { eager: 1 } : {})),
})
</script>
