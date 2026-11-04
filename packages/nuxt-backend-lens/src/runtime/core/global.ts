/**
 * Window property the running lens is published under. A string, not a Symbol: other realms (the
 * Nuxt DevTools iframe) have their own Symbol registry and could not look a Symbol up.
 */
export const LENS_GLOBAL_KEY = '__BACKEND_LENS__'
