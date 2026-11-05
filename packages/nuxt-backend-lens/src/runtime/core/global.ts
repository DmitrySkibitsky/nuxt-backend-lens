/**
 * Window property the running lens is published under. A string, not a Symbol: other realms (the
 * Nuxt DevTools iframe) have their own Symbol registry and could not look a Symbol up.
 */
export const LENS_GLOBAL_KEY = '__BACKEND_LENS__'

/**
 * The first value `pick` finds in an ancestor window, walking up from `view`'s parent. Stops at a
 * cross-origin ancestor, whose properties cannot be read.
 */
export function findInAncestors<T>(view: Window, pick: (ancestor: Window) => T | undefined): T | undefined {
  let current = view
  while (current.parent !== current) {
    current = current.parent
    try {
      const found = pick(current)
      if (found !== undefined) {
        return found
      }
    }
    catch {
      return undefined
    }
  }
  return undefined
}
