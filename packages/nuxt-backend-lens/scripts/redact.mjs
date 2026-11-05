// Redaction for captured fixtures, which are committed. `redact` replaces what is known to be
// secret; `findLeaks` then scans the result for anything that still looks like a credential, so a
// new scenario with data nobody anticipated fails instead of leaking.

export const REDACTED = '[redacted]'

// Environment-style names (APP_KEY, AWS_SECRET_ACCESS_KEY, …).
const SECRET_ENV_NAME = /^[A-Z0-9_]*(?:KEY|SECRET|PASSWORD|TOKEN|CREDENTIAL)[A-Z0-9_]*$/
// Headers (also as server variables, HTTP_COOKIE) and form fields that carry credentials.
const SECRET_FIELD = /^(?:(?:http_)?(?:cookie|set-cookie|authorization|x-xsrf-token|x-csrf-token)|php_auth_pw|password|password_confirmation|current_password|_token|remember_token|access_token|refresh_token)$/i
// Whole collectors / fields that hold cookies or session contents.
const SECRET_CONTAINER = /^(?:cookies|sessionData|request_cookies|response_cookies|session_attributes)$/
// `scheme://user:password@host`: DB_URL, REDIS_URL, …
const URL_CREDENTIALS = /(\b[a-z][a-z\d+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi

/** Deep copy with secrets replaced. Cache keys and other lowercase `key` fields are left alone. */
export function redact(value, name = '') {
  if (SECRET_CONTAINER.test(name) && value && typeof value === 'object') {
    return REDACTED
  }
  if (Array.isArray(value)) {
    return value.map(item => redact(item, name))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item, key)]))
  }
  if (typeof value === 'string') {
    if (SECRET_ENV_NAME.test(name) || SECRET_FIELD.test(name) || value.startsWith('base64:')) {
      return REDACTED
    }
    return value.replace(URL_CREDENTIALS, `$1${REDACTED}@`)
  }
  return value
}

const LEAKS = [
  { name: 'bcrypt hash', pattern: /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/ },
  { name: 'Laravel key', pattern: /base64:[A-Za-z0-9+/]{20,}/ },
  { name: 'bearer token', pattern: /Bearer\s+[\w.~+/-]{16,}/i },
  { name: 'Sanctum token', pattern: /\b\d+\|[a-z0-9]{40,}/i },
  { name: 'session or XSRF cookie', pattern: /(?:_session|XSRF-TOKEN|remember_web_\w+)=[^;\s"]{16,}/ },
  { name: 'credentials in a URL', pattern: /\b[a-z][a-z\d+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i },
]

/** Credential-looking strings left in `value`, with their JSON paths. Empty means safe to commit. */
export function findLeaks(value, path = '$') {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findLeaks(item, `${path}[${index}]`))
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => findLeaks(item, `${path}.${key}`))
  }
  if (typeof value !== 'string') {
    return []
  }
  return LEAKS.filter(leak => leak.pattern.test(value)).map(leak => `${path}: ${leak.name}`)
}
