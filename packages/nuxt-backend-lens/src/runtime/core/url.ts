/**
 * Resolves a server-provided path against the origin of the response it came with.
 * Servers send both absolute (`/__clockwork/`) and root-relative-without-slash
 * (`_debugbar/clockwork/`) forms; both mean "from the server root". Full URLs are kept as is.
 * Resolving against the *response* origin (not the page) keeps cross-origin APIs working.
 */
export function resolveOnServer(path: string, responseUrl: string): string {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(path)) {
    return path
  }
  return new URL(path.replace(/^\/?/, '/'), responseUrl).toString()
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
