import { EMBED_TOKEN_STORAGE_KEY, embedTokenFromHash, isEmbedPath } from '@shared/auth'

/** In-memory fallback when sessionStorage is blocked inside a third-party iframe (Yandex, etc.). */
let memoryToken: string | null = null

export function isEmbedRoute(path: string): boolean {
  return isEmbedPath(path)
}

export function readEmbedToken(): string | null {
  try {
    const stored = sessionStorage.getItem(EMBED_TOKEN_STORAGE_KEY)
    if (stored) return stored
  } catch {
    /* private mode / third-party iframe */
  }
  return memoryToken
}

export function writeEmbedToken(token: string) {
  memoryToken = token
  try {
    sessionStorage.setItem(EMBED_TOKEN_STORAGE_KEY, token)
  } catch {
    /* private mode / third-party iframe */
  }
}

export function clearEmbedToken() {
  memoryToken = null
  try {
    sessionStorage.removeItem(EMBED_TOKEN_STORAGE_KEY)
  } catch {
    /* private mode */
  }
}

/** Must run before the first `/api/auth/session` call (see `main.ts`). */
export function captureEmbedTokenFromLocation() {
  const token = embedTokenFromHash(typeof location !== 'undefined' ? location.hash : '')
  if (!token) return
  writeEmbedToken(token)
  const path = `${location.pathname}${location.search}`
  history.replaceState(null, '', path)
}
