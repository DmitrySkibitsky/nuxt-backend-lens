// Colour mode of the lens UI. The shells decide where it comes from:
//   - toolbar: the app page's own mode when it sets a `light` / `dark` class (e.g. @nuxtjs/color-mode),
//     otherwise the OS / browser preference;
//   - DevTools tab: Nuxt DevTools' own colour mode, which the user can set independently of the OS.
//     DevTools marks it with a `light` / `dark` class on its document element.

import { type Ref, ref, watch } from 'vue'

export type ColorMode = 'light' | 'dark'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Follows the system preference. Returns the mode and a stop function. */
export function systemColorMode(view: Window = window): [Ref<ColorMode>, () => void] {
  const query = view.matchMedia?.(DARK_QUERY)
  const mode = ref<ColorMode>(query?.matches ? 'dark' : 'light')
  if (!query) {
    return [mode, () => {}]
  }
  const update = () => {
    mode.value = query.matches ? 'dark' : 'light'
  }
  query.addEventListener('change', update)
  return [mode, () => query.removeEventListener('change', update)]
}

/**
 * Follows the colour mode of a document that marks it with a `dark` class (Nuxt DevTools' client),
 * falling back to the system preference when it carries neither `dark` nor `light`.
 */
export function documentColorMode(target: Document, fallback: Window = window): [Ref<ColorMode>, () => void] {
  const [system, stopSystem] = systemColorMode(fallback)
  const read = (): ColorMode => {
    const classes = target.documentElement.classList
    if (classes.contains('dark')) {
      return 'dark'
    }
    if (classes.contains('light')) {
      return 'light'
    }
    return system.value
  }
  const mode = ref<ColorMode>(read())
  const update = () => {
    mode.value = read()
  }
  const observer = new MutationObserver(update)
  observer.observe(target.documentElement, { attributes: true, attributeFilter: ['class'] })
  // Without a class on the document the system decides, so its changes matter too.
  const stopWatch = watch(system, update)
  return [mode, () => {
    observer.disconnect()
    stopWatch()
    stopSystem()
  }]
}

/** The nearest ancestor document (same origin) that carries a colour-mode class, if any. */
export function findColorModeDocument(view: Window = window): Document | undefined {
  let current: Window = view
  while (current.parent !== current) {
    current = current.parent
    try {
      const classes = current.document.documentElement.classList
      if (classes.contains('dark') || classes.contains('light')) {
        return current.document
      }
    }
    catch {
      return undefined
    }
  }
  return undefined
}

/** Font families Nuxt DevTools uses for text and code. */
export const DEVTOOLS_FONT_FAMILIES = ['DM Sans', 'DM Mono']

/**
 * Copies the `@font-face` rules of the given families from a (same-origin) document into this one,
 * so an iframe can use the fonts its parent already loaded. Returns how many rules were copied.
 */
export function adoptFontFaces(from: Document, to: Document, families: readonly string[]): number {
  const wanted = new Set(families.map(family => family.toLowerCase()))
  const rules: string[] = []
  for (const sheet of Array.from(from.styleSheets)) {
    let cssRules: CSSRuleList
    try {
      cssRules = sheet.cssRules
    }
    catch {
      continue // cross-origin stylesheet
    }
    for (const rule of Array.from(cssRules)) {
      // The parent's rules belong to another realm: check the text, not `instanceof CSSFontFaceRule`.
      if (rule.cssText.startsWith('@font-face')) {
        const family = (rule as CSSFontFaceRule).style?.getPropertyValue('font-family').replace(/["']/g, '').trim().toLowerCase()
        if (family && wanted.has(family)) {
          rules.push(rule.cssText)
        }
      }
    }
  }
  if (rules.length) {
    const style = to.createElement('style')
    style.dataset.backendLensFonts = ''
    style.textContent = rules.join('\n')
    to.head.appendChild(style)
  }
  return rules.length
}
