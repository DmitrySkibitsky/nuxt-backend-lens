const FULL_URL = /^[a-z][a-z\d+.-]*:\/\//i

/**
 * Resolves a configured path against the origin of the response it came with.
 * Servers use both absolute (`/__clockwork/`) and root-relative-without-slash
 * (`_debugbar/clockwork/`) forms; both mean "from the server root". Full URLs are kept as is.
 * Resolving against the *response* origin (not the page) keeps cross-origin APIs working.
 */
export function resolveOnServer(path: string, responseUrl: string): string {
  if (FULL_URL.test(path)) {
    return path
  }
  return new URL(path.replace(/^\/?/, '/'), responseUrl).toString()
}

/**
 * Like `resolveOnServer`, for a path a response header carries: `undefined` unless it stays on the
 * response's origin. Any API the app calls can send such a header, and the record is fetched with
 * the page's credentials, so a full URL, `//host` or `javascript:` must not choose the target.
 */
export function resolveHeaderPath(path: string | null, responseUrl: string): string | undefined {
  if (!path) {
    return undefined
  }
  try {
    const origin = new URL(responseUrl).origin
    const resolved = new URL(FULL_URL.test(path) ? path : path.replace(/^\/?/, '/'), responseUrl)
    return resolved.origin === origin ? resolved.toString() : undefined
  }
  catch {
    return undefined
  }
}

/** The URL when it is http(s), for rendering as a link: adapters may be third-party code. */
export function httpUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined
  }
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:' ? url : undefined
  }
  catch {
    return undefined
  }
}

/** Joins a directory-like path and a segment with exactly one slash. */
export function joinPath(directory: string, segment: string): string {
  return `${directory.replace(/\/+$/, '')}/${segment.replace(/^\/+/, '')}`
}

/** Fills `{id}` placeholders. */
export function fillTemplate(template: string, id: string, encode = true): string {
  return template.replaceAll('{id}', encode ? encodeURIComponent(id) : id)
}

/** pathname + search of an absolute URL, for display and matching. */
export function displayPath(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}`
  }
  catch {
    return url
  }
}

/**
 * Glob matching for include/exclude patterns. `**` spans path segments, `*` stays within one,
 * `?` is one character. Patterns starting with a scheme match the full URL, others the pathname.
 */
export function matchesPattern(url: string, pattern: string): boolean {
  const isFullUrl = /^[a-z][a-z\d+.-]*:\/\//i.test(pattern)
  let subject = url
  if (!isFullUrl) {
    try {
      subject = new URL(url).pathname
    }
    catch {
      subject = url
    }
  }
  return globToRegExp(pattern).test(subject)
}

export function matchesAny(url: string, patterns: readonly string[]): boolean {
  return patterns.some(pattern => matchesPattern(url, pattern))
}

const globCache = new Map<string, RegExp>()

function globToRegExp(pattern: string): RegExp {
  const cached = globCache.get(pattern)
  if (cached) {
    return cached
  }
  let source = ''
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]!
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        source += '.*'
        index++
      }
      else {
        source += '[^/]*'
      }
    }
    else if (char === '?') {
      source += '[^/]'
    }
    else {
      source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  const regExp = new RegExp(`^${source}$`)
  globCache.set(pattern, regExp)
  return regExp
}
