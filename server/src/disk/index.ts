import type { Storage } from '../db.js'
import type { Disk } from './disk.js'
import { createLiveDisk } from './live.js'
import { createMockDisk } from './mock.js'

export * from './disk.js'

export interface BitrixConfig {
  mode?: string
  webhookUrl?: string
  rootFolderId?: string
}

export function createDisk(storage: Storage, config: BitrixConfig = {}): Disk {
  if (config.mode !== 'live') return createMockDisk(storage)
  if (!config.webhookUrl) throw new Error('BITRIX_MODE=live требует BITRIX_WEBHOOK_URL')
  return createLiveDisk({ webhookUrl: config.webhookUrl, rootFolderId: config.rootFolderId || undefined })
}
