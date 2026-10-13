type Level = 'info' | 'warn' | 'error'

const SECRET_PATTERNS: readonly [RegExp, string][] = [
  [/(\/rest\/\d+\/)[^/\s"'?]+/gi, '$1***'],
  [/([?&](?:auth|code|client_secret|access_token|refresh_token|state|token)=)[^&\s"']+/gi, '$1***'],
  [/(\/t\/|\/api\/public\/test\/)[A-Za-z0-9_-]{16,}/g, '$1***'],
  [/("?(?:password|client_secret|access_token|refresh_token|AUTH_ID|REFRESH_ID)"?\s*[:=]\s*"?)[^"&\s,}]+/gi, '$1***'],
]

/** Masks webhook keys, OAuth codes/tokens, test links and passwords before anything reaches the log. */
export function redact(text: string): string {
  return SECRET_PATTERNS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text)
}

function describeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { error: redact(String(error)) }
  const cause = error.cause instanceof Error ? { cause: redact(`${error.cause.name}: ${error.cause.message}`) } : {}
  return { error: redact(`${error.name}: ${error.message}`), stack: redact(error.stack ?? ''), ...cause }
}

function write(level: Level, message: string, details?: unknown) {
  const fields = details === undefined ? {} : details instanceof Error || typeof details !== 'object' || details === null ? describeError(details) : details
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg: redact(message), ...fields })
  const safe = redact(line)
  if (level === 'error') console.error(safe)
  else if (level === 'warn') console.warn(safe)
  else console.log(safe)
}

/** One JSON object per line (docker logs); never pass personal data — ids and counts only. */
export const log = {
  info: (message: string, details?: Record<string, unknown>) => write('info', message, details),
  warn: (message: string, details?: unknown) => write('warn', message, details),
  error: (message: string, details?: unknown) => write('error', message, details),
}
