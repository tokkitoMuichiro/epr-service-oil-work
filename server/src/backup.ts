import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import type { Database } from './db.js'
import { BACKUPS_FOLDER, ensurePath, type Disk } from './disk/index.js'

const BACKUP_FILE = /^erp-.+\.sqlite$/
const BACKUP_STAMP = /^erp-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/
const DAY_MS = 24 * 60 * 60 * 1000

/** The moment encoded in a backup file name; null for any other file. */
export function backupDate(name: string): Date | null {
  const match = BACKUP_STAMP.exec(name)
  if (!match || !BACKUP_FILE.test(name)) return null
  const [, day, hh, mm, ss, ms] = match
  const date = new Date(`${day}T${hh}:${mm}:${ss}.${ms}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Off-site copy in `ERP/Резервные копии`; copies older than `keepDays` go to the Bitrix trash. */
export async function copyBackupToDisk(disk: Disk, file: string, keepDays: number, now = new Date()): Promise<{ path: string; removed: string[] }> {
  const folder = await ensurePath(disk, [BACKUPS_FOLDER])
  const uploaded = await disk.upload(folder, path.basename(file), { data: readFileSync(file), mimeType: 'application/vnd.sqlite3' })
  const threshold = now.getTime() - keepDays * DAY_MS
  const removed: string[] = []
  for (const entry of await disk.list(folder)) {
    const date = backupDate(entry.name)
    if (!date || date.getTime() >= threshold) continue
    await disk.trash(entry.fileId)
    removed.push(entry.name)
  }
  return { path: uploaded.path, removed }
}

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
