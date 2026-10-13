import type { Storage } from '../db.js'
import type { Disk } from './disk.js'
import { createLiveDisk } from './live.js'
import { createMockDisk } from './mock.js'

export * from './disk.js'

export interface BitrixConfig {
  mode?: string
  webhookUrl?: string
  rootFolderId?: string
  /** Portal address for «Войти через Битрикс24»; defaults to the webhook origin. */
  portal?: string
  clientId?: string
  clientSecret?: string
}

export function createDisk(storage: Storage, config: BitrixConfig = {}, fetchImpl?: typeof fetch): Disk {
  if (config.mode !== 'live') return createMockDisk(storage)
  if (!config.webhookUrl) throw new Error('BITRIX_MODE=live требует BITRIX_WEBHOOK_URL')
  return createLiveDisk({ webhookUrl: config.webhookUrl, rootFolderId: config.rootFolderId || undefined, fetchImpl })
}
