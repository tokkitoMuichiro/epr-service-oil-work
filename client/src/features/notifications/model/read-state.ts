const LEGACY_READ_KEY = 'erp-notifications-read'

function storageKey(userId: string): string {
  return `erp-notifications-read:${userId}`
}

function readSet(key: string): Set<string> {
  if (typeof sessionStorage === 'undefined') return new Set()
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

function writeSet(key: string, ids: Set<string>) {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(key, JSON.stringify([...ids]))
}

export function loadReadIds(userId: string | null | undefined): Set<string> {
  if (!userId) return new Set()
  return readSet(storageKey(userId))
}

export function persistReadIds(userId: string | null | undefined, ids: Set<string>) {
  if (!userId) return
  writeSet(storageKey(userId), ids)
}

/** Drop legacy unscoped key and optionally the current user's set. */
export function clearReadIds(userId?: string | null) {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(LEGACY_READ_KEY)
  if (userId) sessionStorage.removeItem(storageKey(userId))
}
