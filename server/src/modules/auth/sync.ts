import type { AuditLog } from '../../db.js'
import { log } from '../../log.js'
import type { BitrixDirectory } from './bitrix.js'
import type { UserRepository } from './repository.js'

export interface BitrixUserSyncResult {
  checked: number
  /** Logins of accounts disabled in this run. */
  disabled: string[]
}

const SYNC_ACTOR = 'Синхронизация с Битрикс'

/** Disables ERP accounts of users fired in Bitrix24 so open sessions end too. */
export function createBitrixUserSync(directory: BitrixDirectory, users: UserRepository, audit?: AuditLog) {
  let running: Promise<BitrixUserSyncResult> | null = null

  async function sync(): Promise<BitrixUserSyncResult> {
    const linked = users.list().filter((u) => u.active && u.bitrixUserId)
    if (!linked.length) return { checked: 0, disabled: [] }
    const { disabled, kept } = users.deactivateBitrixUsers(await directory.firedUserIds())
    const label = (u: { fullName: string; login: string; bitrixUserId: string | null }) => `${u.fullName} (${u.login}, ID ${u.bitrixUserId})`
    if (disabled.length) {
      audit?.record({
        userId: null,
        userName: SYNC_ACTOR,
        action: 'bitrix_user_sync',
        details: ['Отключены учётные записи уволенных в Битрикс24:', ...disabled.map(label)].join('\n'),
      })
    }
    if (kept.length) {
      log.warn('Уволен в Битрикс24, но оставлен как последний администратор ERP', { userIds: kept.map((u) => u.id) })
    }
    return { checked: linked.length, disabled: disabled.map((u) => u.login) }
  }

  return {
    /** Concurrent calls share one run. */
    run(): Promise<BitrixUserSyncResult> {
      running ??= sync().finally(() => {
        running = null
      })
      return running
    },
  }
}

export type BitrixUserSync = ReturnType<typeof createBitrixUserSync>
