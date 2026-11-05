// Maps the request list to timeline events (Vue DevTools' Timeline). Framework-free: the shell only
// forwards the produced events. Each request is a group: a start event when it is seen, an end event
// once its record is resolved (loaded / failed / none), so DevTools draws its duration and summary.

import { type AnalysisOptions, analyzeDetails } from './analysis'
import type { ActionEntry } from './actions'
import type { RequestEntry } from './types'

export interface LensTimelineEvent {
  /** Epoch milliseconds. */
  time: number
  title: string
  subtitle?: string
  groupId: string
  logType: 'default' | 'warning' | 'error'
  data: Record<string, unknown>
}

const TERMINAL = new Set(['loaded', 'error', 'none'])

const requestTitle = (entry: RequestEntry) => `${entry.method} ${entry.path}`
const actionLabel = (action: ActionEntry) => `${action.type} “${action.label}”`

export interface TimelineEmitter {
  /**
   * Feed the current store state; emits what has not been emitted yet. Nothing is marked as sent
   * while `canEmit()` is false, so a later sync delivers it — no loss, no duplicates.
   */
  sync(entries: readonly RequestEntry[], actions: readonly ActionEntry[]): void
}

export function createTimelineEmitter(
  emit: (event: LensTimelineEvent) => void,
  options: AnalysisOptions & { timeOrigin: number, canEmit?: () => boolean },
): TimelineEmitter {
  const started = new Set<number>()
  const ended = new Set<number>()

  const epoch = (performanceTime: number) => options.timeOrigin + performanceTime

  return {
    sync(entries, actions) {
      if (options.canEmit && !options.canEmit()) {
        return
      }
      for (const entry of entries) {
        const groupId = `backend-lens-${entry.key}`
        if (!started.has(entry.key)) {
          started.add(entry.key)
          const action = actions.find(item => item.id === entry.actionId)
          emit({
            time: epoch(entry.startTime),
            title: requestTitle(entry),
            subtitle: action ? actionLabel(action) : undefined,
            groupId,
            logType: 'default',
            data: { method: entry.method, url: entry.url, ...(action ? { action: actionLabel(action) } : {}) },
          })
        }
        if (!ended.has(entry.key) && TERMINAL.has(entry.detailsState)) {
          ended.add(entry.key)
          emit(endEvent(entry, groupId, epoch(entry.startTime + entry.durationMs), options))
        }
      }
      // Keys only grow and the store drops the oldest entries: older keys never come back.
      const oldest = entries[0]?.key ?? Number.POSITIVE_INFINITY
      for (const sent of [started, ended]) {
        for (const key of sent) {
          if (key < oldest) {
            sent.delete(key)
          }
        }
      }
    },
  }
}

function endEvent(entry: RequestEntry, groupId: string, time: number, options: AnalysisOptions): LensTimelineEvent {
  const details = entry.details
  const analysis = details ? analyzeDetails(details, options) : undefined
  const issues = analysis
    ? [
        analysis.nPlusOne && `${analysis.nPlusOne} N+1`,
        analysis.duplicates && `${analysis.duplicates} duplicate`,
        analysis.slow && `${analysis.slow} slow`,
      ].filter(Boolean) as string[]
    : []

  const parts = [String(entry.status), `${Math.round(entry.durationMs)} ms`]
  if (details) {
    parts.push(`${details.queries.length} q`, `${Math.round(details.queriesDurationMs)} ms DB`, ...issues)
  }
  else if (entry.detailsState === 'error') {
    parts.push('record failed')
  }

  return {
    time,
    title: requestTitle(entry),
    subtitle: parts.join(' · '),
    groupId,
    logType: entry.status >= 500 || details?.exceptions.length ? 'error' : issues.length ? 'warning' : 'default',
    data: {
      status: entry.status,
      durationMs: Math.round(entry.durationMs * 10) / 10,
      ...(details
        ? {
            adapter: details.adapter,
            queries: details.queries.length,
            databaseMs: Math.round(details.queriesDurationMs * 10) / 10,
            issues,
            controller: details.controller,
          }
        : {}),
      ...(entry.error ? { error: entry.error } : {}),
    },
  }
}
