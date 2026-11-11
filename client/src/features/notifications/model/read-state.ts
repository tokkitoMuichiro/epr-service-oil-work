const READ_KEY = 'erp-notifications-read'

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

export function loadReadIds(): Set<string> {
  return readSet(READ_KEY)
}

export function persistReadIds(ids: Set<string>) {
  writeSet(READ_KEY, ids)
}
