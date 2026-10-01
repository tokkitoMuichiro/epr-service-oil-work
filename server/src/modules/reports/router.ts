import { Router } from 'express'
import { badRequest, param, trimmed } from '../../http.js'
import { isIsoDate } from '../../shared.js'
import type { ContractsRepository } from '../contracts/repository.js'
import type { ReportsRepository } from './repository.js'

export function reportsRouter(reports: ReportsRepository, contracts: ContractsRepository) {
  const router = Router()

  router.get('/objects', (req, res) => {
    res.json({ items: contracts.reportObjects(trimmed(req.query.q)) })
  })

  router.get('/', (req, res) => {
    res.json({ items: reports.list(trimmed(req.query.objectId) || undefined) })
  })

  router.get('/:objectId/dates', (req, res) => {
    const objectId = param(req, 'objectId')
    res.json({ objectId, dates: reports.dates(objectId) })
  })

  router.get('/:objectId/:date', (req, res) => {
    const date = param(req, 'date')
    if (!isIsoDate(date)) badRequest('Дата должна быть в формате YYYY-MM-DD')
    res.json({ item: reports.get(param(req, 'objectId'), date) })
  })

  router.post('/', (req, res) => {
    res.json({ item: reports.save(req.body ?? {}) })
  })

  return router
}
