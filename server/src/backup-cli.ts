import { backupDatabase, copyBackupToDisk, pruneBackups } from './backup.js'
import { openDatabase } from './db.js'
import { bitrixConfigFromEnv } from './disk/env.js'
import { createLiveDisk } from './disk/live.js'

const dbPath = process.env.DB_PATH || 'data/erp.sqlite'
const dir = process.env.BACKUP_DIR || 'data/backups'
const keepDays = Number(process.env.BACKUP_KEEP_DAYS) || 14
const label = process.argv[2] ?? 'manual'
const bitrix = bitrixConfigFromEnv()

const db = openDatabase(dbPath)
let file: string
try {
  file = backupDatabase(db, dir, label)
  const removed = pruneBackups(dir, keepDays)
  console.log(`Backup: ${file}${removed.length ? `; removed old: ${removed.length}` : ''}`)
} finally {
  db.close()
}

// Pre-release backups stay local: a Bitrix outage must not block deploy.sh.
if (bitrix.mode === 'live' && bitrix.webhookUrl && !label.startsWith('pre-')) {
  try {
    const disk = createLiveDisk({ webhookUrl: bitrix.webhookUrl, rootFolderId: bitrix.rootFolderId || undefined })
    const copy = await copyBackupToDisk(disk, file, keepDays)
    console.log(`Bitrix Disk: ${copy.path}${copy.removed.length ? `; moved to trash: ${copy.removed.length}` : ''}`)
  } catch (error) {
    console.error('Копия на Диск Битрикс не создана — локальная копия есть', error)
    process.exitCode = 1
  }
}
