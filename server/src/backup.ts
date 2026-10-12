import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import type { Database } from './db.js'

const BACKUP_FILE = /^erp-.+\.sqlite$/
const DAY_MS = 24 * 60 * 60 * 1000

function backupLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '') || 'manual'
}

/** `VACUUM INTO` produces a consistent copy while the server keeps writing. */
export function backupDatabase(db: Database, dir: string, label: string, now = new Date()): string {
  mkdirSync(dir, { recursive: true })
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  const file = path.resolve(dir, `erp-${stamp}-${backupLabel(label)}.sqlite`)
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
  return file
}

export function pruneBackups(dir: string, keepDays: number, now = new Date()): string[] {
  const threshold = now.getTime() - keepDays * DAY_MS
  const removed: string[] = []
  for (const name of readdirSync(dir)) {
    if (!BACKUP_FILE.test(name)) continue
    const file = path.join(dir, name)
    if (statSync(file).mtimeMs < threshold) {
      unlinkSync(file)
      removed.push(file)
    }
  }
  return removed
}
