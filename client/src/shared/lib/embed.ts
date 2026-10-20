import { EMBED_TOKEN_STORAGE_KEY, isEmbedPath } from '@shared/auth'

export function isEmbedRoute(path: string): boolean {
  return isEmbedPath(path)
}

export function readEmbedToken(): string | null {
  try {
    return sessionStorage.getItem(EMBED_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function clearEmbedToken() {
  try {
    sessionStorage.removeItem(EMBED_TOKEN_STORAGE_KEY)
  } catch {
    /* private mode */
  }
}
