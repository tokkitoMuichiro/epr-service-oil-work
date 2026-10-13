import { createApp } from './app.js'
import { openDatabase } from './db.js'
import { loadDemoSeed } from './demo-seed.js'
import { bitrixConfigFromEnv } from './disk/env.js'
import { closeGracefully } from './lifecycle.js'

const port = Number(process.env.PORT) || 4568
const host = process.env.HOST || '0.0.0.0'
const isProduction = process.env.NODE_ENV === 'production'
const dbPath = process.env.DB_PATH || 'data/erp.sqlite'
const wantsDemo = process.env.SEED_DEMO ? process.env.SEED_DEMO === '1' : !isProduction

const adminLogin = process.env.ADMIN_LOGIN?.trim()
const adminPassword = process.env.ADMIN_PASSWORD

const seed = wantsDemo ? await loadDemoSeed() : null
if (wantsDemo && !seed) console.warn('Демо-данные не найдены (server/src/testing/fixtures): новая база будет пустой')

const db = openDatabase(dbPath)
const app = createApp({
  clientDist: process.env.CLIENT_DIST,
  version: process.env.APP_VERSION,
  db,
  seed: seed ?? undefined,
  devLogin: !isProduction && process.env.DEV_LOGIN !== '0',
  admin: adminLogin && adminPassword ? { login: adminLogin, password: adminPassword } : undefined,
  secureCookies: process.env.COOKIE_SECURE === '1' ? true : undefined,
  trustProxy: process.env.TRUST_PROXY === '1',
  corsOrigins: process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean),
  publicUrl: process.env.PUBLIC_URL?.trim().replace(/\/+$/, '') || undefined,
  bitrix: bitrixConfigFromEnv(),
  diskSyncMs: (Number(process.env.BITRIX_SYNC_MINUTES) || 10) * 60_000,
})

if (isProduction && !adminLogin) {
  console.warn('ADMIN_LOGIN/ADMIN_PASSWORD не заданы: если пользователей ещё нет, войти в систему будет некому')
}
if (isProduction && !process.env.PUBLIC_URL) {
  console.warn('PUBLIC_URL не задан: ссылки на проверку знаний будут строиться по адресу запроса')
}
if (isProduction && (process.env.BITRIX_MODE?.trim() || 'mock') === 'mock') {
  console.warn('BITRIX_MODE=mock: файлы хранятся в базе, а не на Диске Битрикс24')
}

const server = app.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}, database: ${dbPath}`)
})

let isStopping = false
function stop(signal: NodeJS.Signals) {
  if (isStopping) return
  isStopping = true
  console.log(`${signal}: stopping`)
  closeGracefully({ server, db })
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error('Shutdown failed', error)
      process.exit(1)
    })
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
