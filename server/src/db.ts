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
`

export function openDatabase(file = ':memory:'): Database {
  if (file !== ':memory:') mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  db.exec(SCHEMA)
  return db
}

export interface FileStore {
  get(id: string): StoredFile | undefined
  set(id: string, file: StoredFile): void
  delete(id: string): void
}

export interface SnapshotOptions<T> {
  /** Demo data; written only into a database that had no module data at all. */
  seed: () => T
  /** Initial state for a module added to an existing database. */
  empty: () => T
}

export interface Snapshot<T> {
  state: T
  save(state: T): void
}

export interface StorageOptions {
  /** Fill a brand-new database with demo data. */
  seedDemo?: boolean
}

export function createStorage(db: Database, options: StorageOptions = {}) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM snapshots').get() as { count: number }
  const shouldSeed = count === 0 && options.seedDemo !== false
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

  return {
    db,

    snapshot<T>(key: string, init: SnapshotOptions<T>): Snapshot<T> {
      const row = selectSnapshot.get(key) as { value: string } | undefined
      const state = row ? (JSON.parse(row.value) as T) : shouldSeed ? init.seed() : init.empty()
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

export function createAuditLog(db: Database) {
  const insert = db.prepare('INSERT INTO audit_log (at, user_id, user_name, action, details) VALUES (?, ?, ?, ?, ?)')
  const select = db.prepare('SELECT at, user_id, user_name, action, details FROM audit_log ORDER BY id DESC LIMIT ?')

  return {
    record(entry: { userId: string | null; userName: string; action: string; details: string }) {
      insert.run(new Date().toISOString(), entry.userId, entry.userName, entry.action, entry.details)
    },

    list(limit = 100) {
      return (select.all(limit) as { at: string; user_id: string | null; user_name: string; action: string; details: string }[]).map(
        (r) => ({ at: r.at, userId: r.user_id, userName: r.user_name, action: r.action, details: r.details }),
      )
    },
  }
}

export type AuditLog = ReturnType<typeof createAuditLog>
