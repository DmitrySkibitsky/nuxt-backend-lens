import type { StackFrame } from './types'

const VENDOR_PATH = /(?:^|\/)vendor\//

export function isVendorPath(file: string): boolean {
  return VENDOR_PATH.test(file)
}

/** First application frame: where a query or log entry came from. */
export function findCallSite(trace: readonly StackFrame[]): StackFrame | undefined {
  return trace.find(frame => !frame.isVendor && frame.file !== '')
}

export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return undefined
}

export function toLine(value: unknown): number | null {
  return toNumber(value) ?? null
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
