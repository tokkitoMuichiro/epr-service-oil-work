import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { StoredFile } from './http.js'

export type Database = DatabaseSync

const SCHEMA = `
CREATE TABLE IF NOT EXISTS snapshots (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS files (
  bucket TEXT NOT NULL,
  id TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (bucket, id)
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  worker_id TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_reports (
  id TEXT PRIMARY KEY,
  object_id TEXT NOT NULL,
  date TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (object_id, date)
);
CREATE INDEX IF NOT EXISTS daily_reports_object ON daily_reports(object_id);
`

export function openDatabase(file = ':memory:'): Database {
  if (file !== ':memory:') mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  db.exec(SCHEMA)
  migrate(db)
  return db
}

/** Columns are only added, so an older release still runs on a migrated database. */
function migrate(db: Database) {
  const userColumns = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name)
  if (!userColumns.includes('bitrix_user_id')) db.exec('ALTER TABLE users ADD COLUMN bitrix_user_id TEXT')
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_bitrix_user ON users(bitrix_user_id) WHERE bitrix_user_id IS NOT NULL')
  db.exec(`CREATE TABLE IF NOT EXISTS daily_reports (
    id TEXT PRIMARY KEY,
    object_id TEXT NOT NULL,
    date TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (object_id, date)
  )`)
  db.exec('CREATE INDEX IF NOT EXISTS daily_reports_object ON daily_reports(object_id)')
}

/** Snapshot key sizes for admin storage metrics (bytes of JSON text). */
export function snapshotSizes(db: Database): { key: string; bytes: number; updatedAt: string }[] {
  const rows = db.prepare('SELECT key, length(value) AS bytes, updated_at FROM snapshots ORDER BY key').all() as {
    key: string
    bytes: number
    updated_at: string
  }[]
  return rows.map((r) => ({ key: r.key, bytes: r.bytes, updatedAt: r.updated_at }))
}

export interface FileStore {
  get(id: string): StoredFile | undefined
  set(id: string, file: StoredFile): void
  delete(id: string): void
}

export interface SnapshotOptions<T> {
  /** Initial state when the database has no data for the module. */
  empty: () => T
}

export interface Snapshot<T> {
  state: T
  save(state: T): void
}

export interface SeedFile {
  bucket: string
  id: string
  file: StoredFile
}

/** Initial content for a brand-new database (the local demo dataset). */
export interface DatabaseSeed {
  /** State factories by snapshot key; modules without one start from `empty`. */
  snapshots: Readonly<Record<string, () => unknown>>
  files?: () => SeedFile[]
}

export interface StorageOptions {
  /** Applied only when the database has no snapshots at all. */
  seed?: DatabaseSeed
}

export function createStorage(db: Database, options: StorageOptions = {}) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM snapshots').get() as { count: number }
  const seed = count === 0 ? options.seed : undefined
  const selectSnapshot = db.prepare('SELECT value FROM snapshots WHERE key = ?')
  const upsertSnapshot = db.prepare(
    `INSERT INTO snapshots (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
  const selectFile = db.prepare('SELECT mime_type, data FROM files WHERE bucket = ? AND id = ?')
  const upsertFile = db.prepare(
    `INSERT INTO files (bucket, id, mime_type, data) VALUES (?, ?, ?, ?)
     ON CONFLICT(bucket, id) DO UPDATE SET mime_type = excluded.mime_type, data = excluded.data`,
  )
  const deleteFile = db.prepare('DELETE FROM files WHERE bucket = ? AND id = ?')

  function save(key: string, state: unknown) {
    upsertSnapshot.run(key, JSON.stringify(state), new Date().toISOString())
  }

  for (const { bucket, id, file } of seed?.files?.() ?? []) {
    upsertFile.run(bucket, id, file.mimeType, file.data)
  }

  return {
    db,

    snapshot<T>(key: string, init: SnapshotOptions<T>): Snapshot<T> {
      const row = selectSnapshot.get(key) as { value: string } | undefined
      const seeded = seed?.snapshots[key]
      const state = row ? (JSON.parse(row.value) as T) : seeded ? (seeded() as T) : init.empty()
      if (!row) save(key, state)
      return { state, save: (next) => save(key, next) }
    },

    files(bucket: string): FileStore {
      return {
        get(id) {
          const row = selectFile.get(bucket, id) as { mime_type: string; data: Uint8Array } | undefined
          return row ? { mimeType: row.mime_type, data: Buffer.from(row.data) } : undefined
        },
        set(id, file) {
          upsertFile.run(bucket, id, file.mimeType, file.data)
        },
        delete(id) {
          deleteFile.run(bucket, id)
        },
      }
    },
  }
}

export type Storage = ReturnType<typeof createStorage>

type Method = (...args: never[]) => unknown

/** Wraps state-changing methods so the module state is written to the database after each call (async ones — once settled). */
export function persisted<T extends object>(target: T, mutators: readonly (keyof T)[], save: () => void): T {
  const wrapped = { ...target }
  for (const key of mutators) {
    const method = target[key] as Method
    wrapped[key] = ((...args: never[]) => {
      let result: unknown
      try {
        result = method.apply(target, args)
      } catch (error) {
        save()
        throw error
      }
      if (result instanceof Promise) return result.finally(save)
      save()
      return result
    }) as T[keyof T]
  }
  return wrapped
}

export interface AuditEntry {
  at: string
  userId: string | null
  userName: string
  action: string
  details: string
}

export interface AuditListFilter {
  limit?: number
  action?: string
  userId?: string
  from?: string
  to?: string
}

export function createAuditLog(db: Database) {
  const insert = db.prepare('INSERT INTO audit_log (at, user_id, user_name, action, details) VALUES (?, ?, ?, ?, ?)')
  const selectRecent = db.prepare(
    'SELECT at, user_id, user_name, action, details FROM audit_log ORDER BY id DESC LIMIT ?',
  )

  function mapRow(r: {
    at: string
    user_id: string | null
    user_name: string
    action: string
    details: string
  }): AuditEntry {
    return { at: r.at, userId: r.user_id, userName: r.user_name, action: r.action, details: r.details }
  }

  return {
    record(entry: { userId: string | null; userName: string; action: string; details: string }) {
      insert.run(new Date().toISOString(), entry.userId, entry.userName, entry.action, entry.details)
    },

    list(limitOrFilter: number | AuditListFilter = 100): AuditEntry[] {
      const filter: AuditListFilter =
        typeof limitOrFilter === 'number' ? { limit: limitOrFilter } : limitOrFilter
      const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500)
      const action = filter.action?.trim() || null
      const userId = filter.userId?.trim() || null
      const from = filter.from?.trim() || null
      const to = filter.to?.trim() || null
      if (!action && !userId && !from && !to) {
        return (selectRecent.all(limit) as Parameters<typeof mapRow>[0][]).map(mapRow)
      }
      const clauses: string[] = []
      const params: unknown[] = []
      if (action) {
        clauses.push('action = ?')
        params.push(action)
      }
      if (userId) {
        clauses.push('user_id = ?')
        params.push(userId)
      }
      if (from) {
        clauses.push('at >= ?')
        params.push(from)
      }
      if (to) {
        clauses.push('at <= ?')
        params.push(`${to}T23:59:59.999Z`)
      }
      const sql = `SELECT at, user_id, user_name, action, details FROM audit_log WHERE ${clauses.join(' AND ')} ORDER BY id DESC LIMIT ?`
      params.push(limit)
      return (db.prepare(sql).all(...(params as (string | number | null)[])) as Parameters<typeof mapRow>[0][]).map(mapRow)
    },

    /** Distinct action names for filter UI. */
    actions(limit = 50): string[] {
      const rows = db
        .prepare('SELECT DISTINCT action FROM audit_log ORDER BY action LIMIT ?')
        .all(limit) as { action: string }[]
      return rows.map((r) => r.action)
    },
  }
}

export type AuditLog = ReturnType<typeof createAuditLog>
