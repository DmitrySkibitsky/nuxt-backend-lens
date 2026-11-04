import { describe, expect, it } from 'vitest'
import { createClockworkAdapter } from '../../src/runtime/core/adapters/clockwork'
import { defaultOptions } from '../../src/runtime/core/options'
import { createTimelineEmitter, type LensTimelineEvent } from '../../src/runtime/core/timeline'
import type { RequestEntry } from '../../src/runtime/core/types'
import { loadFixture } from './helpers'

const adapter = createClockworkAdapter(defaultOptions.adapters.clockwork)
const { response, record } = loadFixture('clockwork', 'books-n-plus-one')
const booksDetails = adapter.parse(record, adapter.detect(response)!)

const entry = (key: number, extra: Partial<RequestEntry> = {}): RequestEntry => ({
  key,
  method: 'GET',
  url: `http://a.test/api/${key}`,
  path: `/api/${key}`,
  status: 200,
  startTime: 100,
  durationMs: 50,
  initiator: 'fetch',
  navigationId: 1,
  serverTiming: [],
  detailsState: 'idle',
  ...extra,
})

function emitter() {
  const events: LensTimelineEvent[] = []
  const timeline = createTimelineEmitter(event => events.push(event), { nPlusOneThreshold: 3, slowQueryMs: 100, timeOrigin: 1_000_000 })
  return { events, timeline }
}

describe('timeline emitter', () => {
  it('opens a group when a request appears and closes it once its record resolves', () => {
    const { events, timeline } = emitter()
    const action = { id: 7, type: 'click', label: 'Run all', time: 90, navigationId: 1 }

    timeline.sync([entry(1, { actionId: 7 })], [action])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ time: 1_000_100, title: 'GET /api/1', subtitle: 'click “Run all”', groupId: 'backend-lens-1', logType: 'default' })

    timeline.sync([entry(1, { actionId: 7, detailsState: 'loading' })], [action])
    expect(events).toHaveLength(1)

    timeline.sync([entry(1, { actionId: 7, detailsState: 'loaded', details: booksDetails })], [action])
    expect(events).toHaveLength(2)
    expect(events[1]).toMatchObject({ time: 1_000_150, groupId: 'backend-lens-1', logType: 'warning' })
    expect(events[1]!.subtitle).toBe(`200 · 50 ms · 31 q · ${Math.round(booksDetails.queriesDurationMs)} ms DB · 1 N+1`)
    expect(events[1]!.data).toMatchObject({ adapter: 'clockwork', queries: 31, issues: ['1 N+1'] })

    timeline.sync([entry(1, { detailsState: 'loaded', details: booksDetails })], [action])
    expect(events).toHaveLength(2) // never emitted twice
  })

  it('closes requests without debug data at once, and marks failures', () => {
    const { events, timeline } = emitter()
    timeline.sync([
      entry(1, { detailsState: 'none' }),
      entry(2, { status: 500, detailsState: 'error', error: 'Record x: HTTP 404' }),
    ], [])
    expect(events.map(event => [event.groupId, event.logType])).toEqual([
      ['backend-lens-1', 'default'],
      ['backend-lens-1', 'default'],
      ['backend-lens-2', 'default'],
      ['backend-lens-2', 'error'],
    ])
    expect(events[3]!.subtitle).toBe('500 · 50 ms · record failed')
    expect(events[3]!.data).toMatchObject({ error: 'Record x: HTTP 404' })
  })
})

describe('timeline emitter gating', () => {
  it('holds events back while the consumer cannot accept them, then catches up once', () => {
    const events: LensTimelineEvent[] = []
    let accepting = false
    const timeline = createTimelineEmitter(event => events.push(event), {
      nPlusOneThreshold: 3,
      slowQueryMs: 100,
      timeOrigin: 0,
      canEmit: () => accepting,
    })
    const entries = [entry(1, { detailsState: 'loaded', details: booksDetails }), entry(2, { detailsState: 'none' })]

    timeline.sync(entries, [])
    expect(events).toHaveLength(0)

    accepting = true
    timeline.sync(entries, [])
    expect(events).toHaveLength(4)
    timeline.sync(entries, [])
    expect(events).toHaveLength(4)
  })
})
