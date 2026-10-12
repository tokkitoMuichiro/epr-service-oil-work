import type { Server } from 'node:http'
import type { Database } from './db.js'

export interface ShutdownOptions {
  server: Server
  db: Database
  /** In-flight requests get this long to finish before their connections are dropped. */
  timeoutMs?: number
}

/** Folds the WAL into the main file so a copied database file is complete on its own. */
export function closeDatabase(db: Database): void {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  db.close()
}

export function closeGracefully({ server, db, timeoutMs = 10_000 }: ShutdownOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => server.closeAllConnections(), timeoutMs)
    timer.unref()
    server.close((error) => {
      clearTimeout(timer)
      try {
        closeDatabase(db)
      } catch (dbError) {
        reject(dbError)
        return
      }
      if (error) reject(error)
      else resolve()
    })
    server.closeIdleConnections()
  })
}
