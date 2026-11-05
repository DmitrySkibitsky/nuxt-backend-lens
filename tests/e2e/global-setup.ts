import type { FullConfig } from '@playwright/test'

// Package-specific tests follow DEBUG_BACKEND. demo/.env goes stale after `make restart BACKEND=…`,
// so the stand's own response headers decide which debug package it runs.
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL
  const response = await fetch(new URL('/api/stats', baseURL))
  const detected = response.headers.has('phpdebugbar-id')
    ? 'debugbar'
    : response.headers.has('x-clockwork-id') ? 'clockwork' : undefined
  if (!detected) {
    throw new Error(`The stand at ${baseURL} sends no debug headers: is it up (make up)?`)
  }
  if (process.env.DEBUG_BACKEND && process.env.DEBUG_BACKEND !== detected) {
    console.warn(`e2e: the stand runs ${detected}; DEBUG_BACKEND=${process.env.DEBUG_BACKEND} is ignored`)
  }
  process.env.DEBUG_BACKEND = detected
}
