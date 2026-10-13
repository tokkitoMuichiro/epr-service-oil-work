import type { BitrixConfig } from './index.js'

export function bitrixConfigFromEnv(env: NodeJS.ProcessEnv = process.env): BitrixConfig {
  return {
    mode: env.BITRIX_MODE?.trim() || 'mock',
    webhookUrl: env.BITRIX_WEBHOOK_URL?.trim(),
    rootFolderId: env.BITRIX_ROOT_FOLDER_ID?.trim(),
  }
}
