<template>
  <div>
    <h1>Write + auth</h1>
    <p class="hint">
      Requests here go through the nuxt-auth-sanctum client: CSRF cookie, session login, then a
      <code>POST</code> that inserts a review, fires an event and queues a job.
    </p>

    <form
      v-if="!isAuthenticated"
      @submit.prevent="signIn"
    >
      <p>
        <input
          v-model="credentials.email"
          type="email"
          placeholder="email"
        >
        <input
          v-model="credentials.password"
          type="password"
          placeholder="password"
        >
        <button type="submit">
          Log in
        </button>
      </p>
      <p
        v-if="authError"
        class="error"
      >
        {{ authError }}
      </p>
    </form>

    <template v-else>
      <p>
        Logged in as <strong>{{ user?.name }}</strong>
        <button @click="logout()">
          Log out
        </button>
      </p>
      <p v-if="book">
        Review for <em>{{ book.title }}</em>:
        <select v-model.number="review.stars">
          <option
            v-for="stars in 5"
            :key="stars"
            :value="stars"
          >
            {{ stars }}★
          </option>
        </select>
        <input
          v-model="review.body"
          placeholder="text"
        >
        <button @click="submitReview">
          Post review
        </button>
      </p>
      <ResultBlock
        :data="result"
        :error="submitError"
        :pending="submitting"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
interface DemoUser {
  id: number
  name: string
  email: string
}

const { isAuthenticated, user, login, logout } = useSanctumAuth<DemoUser>()
const client = useSanctumClient()

const credentials = reactive({ email: 'demo@example.com', password: 'password' })
const authError = ref('')

async function signIn() {
  authError.value = ''
  try {
    await login({ ...credentials })
  }
  catch (error) {
    authError.value = (error as Error).message
  }
}

const { data: books } = await useFetch<{ data: { id: number, title: string }[] }>('/api/books', {
  key: 'review-books',
  query: { eager: 1 },
})
const book = computed(() => books.value?.data[0])

const review = reactive({ stars: 5, body: 'Posted from the demo SPA' })
const result = ref<unknown>()
const submitError = ref<unknown>()
const submitting = ref(false)

async function submitReview() {
  if (!book.value) return
  submitting.value = true
  submitError.value = undefined
  try {
    result.value = await client(`/api/books/${book.value.id}/reviews`, { method: 'POST', body: { ...review } })
  }
  catch (error) {
    submitError.value = error
  }
  finally {
    submitting.value = false
  }
}
</script>
