import { databaseTimeMs } from '../core/server-timing'
import type { RequestEntry } from '../core/types'

export function formatMs(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} s`
  }
  if (value >= 10) {
    return `${Math.round(value)} ms`
  }
  return `${value.toFixed(1)} ms`
}

export function formatBytes(value: number | undefined): string {
  if (value === undefined) {
    return '—'
  }
  const megabytes = value / 1024 / 1024
  return megabytes >= 1 ? `${megabytes.toFixed(1)} MB` : `${Math.round(value / 1024)} KB`
}

/** Query count once the record is loaded. */
export function queryCount(entry: RequestEntry): number | undefined {
  return entry.details?.queries.length
}

/** DB time from the record, or from Server-Timing while the record is not loaded yet. */
export function databaseMs(entry: RequestEntry): number | undefined {
  return entry.details?.queriesDurationMs ?? databaseTimeMs(entry.serverTiming)
}

export function statusClass(status: number): string {
  if (status >= 500) {
    return 'bl-status-error'
  }
  if (status >= 400) {
    return 'bl-status-warn'
  }
  return 'bl-status-ok'
}

export function hasProblem(entry: RequestEntry): boolean {
  return entry.status >= 500 || Boolean(entry.details?.exceptions.length)
}

export function formatFrame(file: string | undefined, line: number | null | undefined): string {
  if (!file) {
    return ''
  }
  return line ? `${file}:${line}` : file
}

export function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  try {
    return JSON.stringify(value)
  }
  catch {
    return String(value)
  }
}

export function formatAction(action: { type: string, label: string }): string {
  return `${action.type} “${action.label}”`
}

export function analysisOptions(options: { nPlusOneThreshold: number, slowQueryMs: number }) {
  return { nPlusOneThreshold: options.nPlusOneThreshold, slowQueryMs: options.slowQueryMs }
}

export const ISSUE_LABELS = {
  'n+1': 'N+1',
  'duplicate': 'duplicate',
  'slow': 'slow',
} as const
