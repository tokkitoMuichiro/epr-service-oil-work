import { backupDatabase, pruneBackups } from './backup.js'
import { openDatabase } from './db.js'

const dbPath = process.env.DB_PATH || 'data/erp.sqlite'
const dir = process.env.BACKUP_DIR || 'data/backups'
const keepDays = Number(process.env.BACKUP_KEEP_DAYS) || 14
const label = process.argv[2] ?? 'manual'

const db = openDatabase(dbPath)
try {
  const file = backupDatabase(db, dir, label)
  const removed = pruneBackups(dir, keepDays)
  console.log(`Backup: ${file}${removed.length ? `; removed old: ${removed.length}` : ''}`)
} finally {
  db.close()
}
