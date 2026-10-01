import { Router } from 'express'
import { param, requestRole } from '../../http.js'
import type { AccessStore } from './store.js'

export function accessRouter(access: AccessStore) {
  const router = Router()

  router.get('/', (req, res) => {
    res.json({ item: access.view(requestRole(req)) })
  })

  router.patch('/roles/:role', (req, res) => {
    res.json({ item: access.update(requestRole(req), param(req, 'role'), req.body?.permissions) })
  })

  return router
}
