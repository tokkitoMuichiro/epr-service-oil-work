import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

const dataDir = path.resolve('e2e/.data')
rmSync(dataDir, { recursive: true, force: true })
mkdirSync(dataDir, { recursive: true })
process.env.DB_PATH = path.join(dataDir, 'erp.sqlite')

await import('../server/src/index.js')
