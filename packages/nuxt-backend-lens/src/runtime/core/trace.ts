import type { StackFrame } from './types'

const VENDOR_PATH = /(?:^|[\\/])vendor[\\/]/
/** An absolute path on a Unix or Windows backend (`/app`, `C:\app`, `\\server\share`). */
const ABSOLUTE_PATH = /^(?:\/|[A-Z]:[\\/]|\\\\)/i

export function isVendorPath(file: string): boolean {
  return VENDOR_PATH.test(file)
}

export function isAbsolutePath(file: string): boolean {
  return ABSOLUTE_PATH.test(file)
}

/**
 * The backend's project root from the files a record names: the part before the first `vendor/`
 * directory of an absolute path (Composer installs dependencies under the project root).
 */
export function basePathFromVendor(files: Iterable<string>): string | undefined {
  for (const file of files) {
    const match = isAbsolutePath(file) ? /^(.*?)[\\/]vendor[\\/]/.exec(file) : null
    if (match?.[1]) {
      return match[1]
    }
  }
  return undefined
}

/** The project root from a file reported both absolute and relative to the root. */
export function basePathFromPair(absolute: string, relative: string): string | undefined {
  const tail = relative.replace(/^[\\/]+/, '')
  if (!tail || !isAbsolutePath(absolute) || isAbsolutePath(relative) || absolute.length <= tail.length) {
    return undefined
  }
  const root = absolute.slice(0, -tail.length)
  return absolute.endsWith(tail) && /[\\/]$/.test(root) ? root.replace(/(?<=.)[\\/]$/, '') : undefined
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
