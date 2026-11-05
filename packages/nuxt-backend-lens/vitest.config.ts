import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// The Vue plugin lets unit tests import the UI's single-file components. The DOM environment is
// chosen per file (`// @vitest-environment happy-dom`): the core needs none.
export default defineConfig({
  plugins: [vue()],
})
