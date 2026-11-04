// SQL presentation: a small, dependency-free tokenizer for highlighting (always available) and an
// optional formatter. sql-formatter is loaded lazily, only when `sql.format` is on, so it costs
// nothing otherwise.

export type SqlTokenType = 'keyword' | 'function' | 'string' | 'number' | 'identifier' | 'comment' | 'operator' | 'punctuation' | 'placeholder' | 'space' | 'text'

export interface SqlToken {
  type: SqlTokenType
  text: string
}

const KEYWORDS = new Set([
  'add', 'all', 'alter', 'and', 'any', 'as', 'asc', 'begin', 'between', 'by', 'case', 'cast', 'commit', 'create',
  'cross', 'default', 'delete', 'desc', 'distinct', 'drop', 'else', 'end', 'except', 'exists', 'false', 'fetch',
  'for', 'foreign', 'from', 'full', 'group', 'having', 'if', 'ilike', 'in', 'index', 'inner', 'insert', 'intersect',
  'into', 'is', 'join', 'key', 'lateral', 'left', 'like', 'limit', 'lock', 'natural', 'not', 'null', 'nulls',
  'offset', 'on', 'or', 'order', 'outer', 'over', 'partition', 'primary', 'references', 'returning', 'right',
  'rollback', 'rows', 'select', 'set', 'share', 'table', 'then', 'true', 'truncate', 'union', 'unique', 'update',
  'using', 'values', 'when', 'where', 'window', 'with',
])

const PATTERNS: [SqlTokenType, RegExp][] = [
  ['space', /^\s+/],
  ['comment', /^(?:--[^\n]*|\/\*[\s\S]*?(?:\*\/|$))/],
  ['string', /^'(?:[^'\\]|\\.|'')*(?:'|$)/],
  ['identifier', /^(?:"(?:[^"]|"")*(?:"|$)|`(?:[^`]|``)*(?:`|$)|\[[^\]]*\]?)/],
  ['placeholder', /^(?:\?|\$\d+|:[a-z_]\w*)/i],
  ['number', /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/i],
  ['text', /^[a-z_][\w$]*/i],
  ['operator', /^(?:<>|<=|>=|!=|::|\|\||[-+*/%=<>!~^&|])/],
  ['punctuation', /^[(),;.]/],
]

/** Splits SQL into tokens. Lossless: joining the token texts gives back the input. */
export function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = []
  let rest = sql
  while (rest) {
    let matched = false
    for (const [type, pattern] of PATTERNS) {
      const match = pattern.exec(rest)
      if (!match) {
        continue
      }
      const text = match[0]
      if (type === 'text') {
        const next = rest.slice(text.length).trimStart()
        if (KEYWORDS.has(text.toLowerCase())) {
          tokens.push({ type: 'keyword', text })
        }
        else if (next.startsWith('(')) {
          tokens.push({ type: 'function', text })
        }
        else {
          tokens.push({ type: 'identifier', text })
        }
      }
      else {
        tokens.push({ type, text })
      }
      rest = rest.slice(text.length)
      matched = true
      break
    }
    if (!matched) {
      tokens.push({ type: 'text', text: rest[0]! })
      rest = rest.slice(1)
    }
  }
  return tokens
}

export interface SqlFormatOptions {
  /** sql-formatter language: sql, postgresql, mysql, mariadb, sqlite, tsql, … */
  dialect: string
}

type Formatter = (sql: string, options: SqlFormatOptions) => string

let formatterPromise: Promise<Formatter> | undefined
const formatted = new Map<string, string>()
const FORMAT_CACHE_LIMIT = 500

function loadFormatter(): Promise<Formatter> {
  formatterPromise ??= import('sql-formatter').then(({ format }) => (sql: string, options: SqlFormatOptions) => {
    // keywordCase 'preserve': servers report SQL as executed; do not rewrite it, only lay it out.
    return format(sql, { language: options.dialect as never, keywordCase: 'preserve', tabWidth: 2 })
  })
  return formatterPromise
}

/**
 * Formatted SQL (multi-line). Falls back to the input when the statement cannot be parsed —
 * debug records may hold vendor-specific or truncated SQL.
 */
export async function formatSql(sql: string, options: SqlFormatOptions): Promise<string> {
  const key = `${options.dialect}\u0000${sql}`
  const cached = formatted.get(key)
  if (cached !== undefined) {
    return cached
  }
  let result: string
  try {
    result = (await loadFormatter())(sql, options)
  }
  catch {
    result = sql
  }
  if (formatted.size >= FORMAT_CACHE_LIMIT) {
    formatted.delete(formatted.keys().next().value!)
  }
  formatted.set(key, result)
  return result
}
