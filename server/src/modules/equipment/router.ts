import { Router } from 'express'
import { param, rawBody, requestUser, sendFile, trimmed, uploadedFile } from '../../http.js'
import { EQUIPMENT_DOCUMENT_MAX_BYTES, todayIso, type EquipmentCondition } from '../../shared.js'
import { equipmentWorkbook } from './excel.js'
import type { EquipmentService } from './service.js'

const documentBody = rawBody(EQUIPMENT_DOCUMENT_MAX_BYTES)

export function equipmentRouter(service: EquipmentService) {
  const router = Router()

  router.get('/state', (req, res) => {
    res.json(service.state(requestUser(req)))
  })

  router.get('/export.xls', (req, res) => {
    const workbook = equipmentWorkbook(service.exportRows(requestUser(req)))
    const fileName = encodeURIComponent(`Учёт оборудования ${todayIso()}.xls`)
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`)
    res.send(workbook)
  })

  router.post('/export/bitrix', (req, res) => {
    res.json({ item: service.exportToBitrix(requestUser(req), todayIso()) })
  })

  router.post('/', (req, res) => {
    res.status(201).json({ item: service.create(requestUser(req), req.body ?? {}) })
  })

  router.post('/transfers', (req, res) => {
    res.status(201).json({ item: service.createTransfer(requestUser(req), req.body ?? {}) })
  })

  router.post('/transfers/bulk', (req, res) => {
    res.json({ item: service.bulkTransfer(requestUser(req), req.body ?? {}) })
  })

  router.post('/warehouses', (req, res) => {
    res.status(201).json({ item: service.createWarehouse(requestUser(req), req.body ?? {}) })
  })

  router.patch('/warehouses/:id', (req, res) => {
    res.json({ item: service.updateWarehouse(requestUser(req), param(req, 'id'), req.body ?? {}) })
  })

  router.delete('/warehouses/:id', (req, res) => {
    service.removeWarehouse(requestUser(req), param(req, 'id'))
    res.status(204).end()
  })

  router.patch('/:id', (req, res) => {
    res.json({ item: service.update(requestUser(req), param(req, 'id'), req.body ?? {}) })
  })

  router.delete('/:id', (req, res) => {
    service.remove(requestUser(req), param(req, 'id'))
    res.status(204).end()
  })

  router.patch('/:id/condition', (req, res) => {
    const body = req.body ?? {}
    const condition = trimmed(body.condition) as EquipmentCondition
    res.json({ item: service.updateCondition(requestUser(req), param(req, 'id'), condition, body.note) })
  })

  router.post('/:id/accept', (req, res) => {
    res.json({ item: service.accept(requestUser(req), param(req, 'id')) })
  })

  router.post('/:id/cancel', (req, res) => {
    res.json({ item: service.cancel(requestUser(req), param(req, 'id')) })
  })

  router.post('/:id/fill/flag', (req, res) => {
    res.json({ item: service.flagFill(requestUser(req), param(req, 'id'), req.body?.comment) })
  })

  router.post('/:id/fill/confirm', (req, res) => {
    res.json({ item: service.confirmFill(requestUser(req), param(req, 'id')) })
  })

  router.get('/:id/history', (req, res) => {
    res.json({ items: service.history(requestUser(req), param(req, 'id')) })
  })

  router.post('/:id/documents', documentBody, (req, res) => {
    const meta = { fileName: trimmed(req.query.fileName) }
    res.status(201).json({ item: service.addDocument(requestUser(req), param(req, 'id'), meta, uploadedFile(req)) })
  })

  router.get('/:id/documents/:docId/file', (req, res) => {
    const { doc, file } = service.documentFile(requestUser(req), param(req, 'id'), param(req, 'docId'))
    sendFile(res, file, doc.fileName)
  })

  router.delete('/:id/documents/:docId', (req, res) => {
    res.json({ item: service.removeDocument(requestUser(req), param(req, 'id'), param(req, 'docId')) })
  })

  return router
}
