// User actions (click, submit, change) that requests can be attributed to. Browsers offer no async
// context from an event to the fetch it eventually causes, so attribution is by time: a request
// belongs to the latest action that happened at most `windowMs` before it started.
//
// Privacy: labels come from markup only (data attribute, aria-label, button/link text, placeholder,
// name). Values typed into fields are never read.

/** Elements (and their subtrees) carrying this attribute are not tracked — the toolbar has it. */
export const IGNORE_ATTRIBUTE = 'data-backend-lens-ignore'
/** Explicit label for an element: `<button data-backend-lens-action="Save draft">`. */
export const LABEL_ATTRIBUTE = 'data-backend-lens-action'

const MAX_LABEL = 60
const INTERACTIVE = [
  `[${LABEL_ATTRIBUTE}]`,
  'button',
  'a[href]',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  'input',
  'select',
  'textarea',
  'summary',
  'label',
].join(', ')

export interface ActionEntry {
  id: number
  type: string
  label: string
  /** performance.now() of the event. */
  time: number
  navigationId: number
}

interface ElementLike {
  tagName: string
  id: string
  textContent: string | null
  getAttribute(name: string): string | null
  closest(selector: string): ElementLike | null
}

function clip(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length > MAX_LABEL ? `${compact.slice(0, MAX_LABEL - 1)}…` : compact
}

function isElement(value: unknown): value is ElementLike {
  return typeof value === 'object' && value !== null && typeof (value as ElementLike).closest === 'function'
}

/** Human label for the element an event happened on. Never reads field values. */
export function describeElement(target: unknown): string {
  if (!isElement(target)) {
    return 'document'
  }
  const element = target.closest(INTERACTIVE) ?? target
  const tag = element.tagName.toLowerCase()
  const explicit = element.getAttribute(LABEL_ATTRIBUTE) || element.getAttribute('aria-label')
  if (explicit) {
    return clip(explicit)
  }
  if (tag === 'input' || tag === 'select' || tag === 'textarea') {
    const type = element.getAttribute('type')
    if (tag === 'input' && (type === 'submit' || type === 'button')) {
      return clip(element.getAttribute('value') || type)
    }
    const name = element.getAttribute('placeholder') || element.getAttribute('name') || element.id
    return clip(name ? `${tag} ${name}` : tag)
  }
  const text = clip(element.textContent ?? '')
  if (text) {
    return text
  }
  return clip(element.getAttribute('title') || (element.id ? `${tag}#${element.id}` : tag))
}

function describeEvent(event: Event): string {
  if (event.type === 'submit') {
    const submitter = (event as SubmitEvent).submitter
    if (submitter) {
      return describeElement(submitter)
    }
    const form = event.target as ElementLike | null
    const name = form?.getAttribute?.('aria-label') || form?.getAttribute?.('name') || form?.id
    return clip(name ? `form ${name}` : 'form')
  }
  return describeElement(event.target)
}

function isIgnored(event: Event): boolean {
  return event.composedPath().some(node => isElement(node) && node.getAttribute(IGNORE_ATTRIBUTE) !== null)
}

export interface ActionTarget {
  document: { addEventListener: Document['addEventListener'], removeEventListener: Document['removeEventListener'] }
  performance: { now(): number }
}

/** Listens in the capture phase; returns a stop function. */
export function trackActions(
  target: ActionTarget,
  events: readonly string[],
  onAction: (action: { type: string, label: string, time: number }) => void,
): () => void {
  const listener = (event: Event) => {
    try {
      if (isIgnored(event)) {
        return
      }
      onAction({ type: event.type, label: describeEvent(event), time: target.performance.now() })
    }
    catch (error) {
      console.warn('[backend-lens] failed to record an action', error)
    }
  }
  for (const type of events) {
    target.document.addEventListener(type, listener, { capture: true, passive: true })
  }
  return () => {
    for (const type of events) {
      target.document.removeEventListener(type, listener, { capture: true })
    }
  }
}

/** The action a request started at `startTime` belongs to, if any. */
export function attributeToAction(actions: readonly ActionEntry[], startTime: number, windowMs: number): ActionEntry | undefined {
  for (let index = actions.length - 1; index >= 0; index--) {
    const action = actions[index]!
    if (action.time <= startTime) {
      return startTime - action.time <= windowMs ? action : undefined
    }
  }
  return undefined
}
