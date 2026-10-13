import { backupDatabase, copyBackupToDisk, pruneBackups } from './backup.js'
import { openDatabase } from './db.js'
import { bitrixConfigFromEnv } from './disk/env.js'
import { createLiveDisk } from './disk/live.js'
import { log } from './log.js'

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
  log.info('Бэкап создан', { file, removedOld: removed.length })
} finally {
  db.close()
}

// Pre-release backups stay local: a Bitrix outage must not block deploy.sh.
if (bitrix.mode === 'live' && bitrix.webhookUrl && !label.startsWith('pre-')) {
  try {
    const disk = createLiveDisk({ webhookUrl: bitrix.webhookUrl, rootFolderId: bitrix.rootFolderId || undefined })
    const copy = await copyBackupToDisk(disk, file, keepDays)
    log.info('Копия бэкапа на Диске Битрикс', { path: copy.path, movedToTrash: copy.removed.length })
  } catch (error) {
    log.error('Копия на Диск Битрикс не создана — локальная копия есть', error)
    process.exitCode = 1
  }
}
