// Replays a real Clockwork response captured from the demo stand (copied in by check.mjs).
import fixture from '../fixture.json'

export default defineEventHandler((event) => {
  for (const [name, value] of Object.entries(fixture.response.headers as Record<string, string>)) {
    setResponseHeader(event, name, value)
  }
  return { ok: true }
})
