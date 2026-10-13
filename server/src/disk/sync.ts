import type { AuditLog } from '../db.js'
import type { Disk } from './disk.js'

/** A module that keeps references to files on Bitrix Disk. */
export interface DiskFileSource {
  diskFileIds(): string[]
  /** Drops references to files deleted on Disk; returns lines for the audit log. */
  forgetDiskFiles(ids: ReadonlySet<string>): string[]
}

export interface DiskSyncResult {
  checked: number
  removed: string[]
}

export function createDiskSync(disk: Disk, sources: readonly DiskFileSource[], audit?: AuditLog) {
  let running: Promise<DiskSyncResult> | null = null

  async function sync(): Promise<DiskSyncResult> {
    const ids = [...new Set(sources.flatMap((s) => s.diskFileIds()))]
    if (!ids.length) return { checked: 0, removed: [] }
    const gone = await disk.missing(ids)
    const removed = gone.size ? sources.flatMap((s) => s.forgetDiskFiles(gone)) : []
    if (removed.length) {
      audit?.record({ userId: null, userName: 'Синхронизация с Битрикс', action: 'disk_sync', details: ['Файлы удалены на Диске Битрикс:', ...removed].join('\n') })
    }
    return { checked: ids.length, removed }
  }

  return {
    /** Concurrent calls share one run. */
    run(): Promise<DiskSyncResult> {
      running ??= sync().finally(() => {
        running = null
      })
      return running
    },
  }
}

export type DiskSync = ReturnType<typeof createDiskSync>

/** Runs the sync in the background; the timer does not keep the process alive. */
export function scheduleDiskSync(sync: DiskSync, intervalMs: number, onError: (error: unknown) => void): () => void {
  const timer = setInterval(() => {
    sync.run().catch(onError)
  }, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}
