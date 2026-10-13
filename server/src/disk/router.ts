import { Router } from 'express'
import { requestRole } from '../http.js'
import type { AccessStore } from '../modules/access/store.js'
import type { Disk } from './disk.js'
import type { DiskSync } from './sync.js'

export function diskRouter(disk: Disk, sync: DiskSync, access: AccessStore) {
  const router = Router()

  router.use((req, _res, next) => {
    access.requirePermission(requestRole(req), 'settings_manage')
    next()
  })

  router.get('/check', async (_req, res) => {
    res.json({ item: await disk.check() })
  })

  router.post('/sync', async (_req, res) => {
    res.json({ item: await sync.run() })
  })

  return router
}
