import { Router, type Request } from 'express'
import {
  badRequest,
  forbidden,
  param,
  rawBody as rawBodyOf,
  requestAuth,
  requestRole,
  sendFile,
  trimmed,
  uploadedFile,
} from '../../http.js'
import { QUALIFICATION_TYPES, areaDeniedMessage, canReadArea, isIsoDate, type DocumentMeta } from '../../shared.js'
import type { AccessStore } from '../access/store.js'
import { DOCUMENT_MAX_BYTES, type AssignmentActor, type PersonnelRepository } from './repository.js'

const rawBody = rawBodyOf(DOCUMENT_MAX_BYTES)

const DOCUMENT_FIELDS = ['title', 'fileName', 'expiresAt', 'qualificationTypeId', 'number', 'issuedAt', 'issuer', 'group'] as const

export function personnelRouter(repo: PersonnelRepository) {
  const router = Router()

  router.get('/', (req, res) => {
    res.json({ items: repo.listWorkers(requestRole(req)) })
  })

  router.get('/:id', (req, res) => {
    res.json({ item: repo.getWorker(requestRole(req), param(req, 'id')) })
  })

  router.post('/', (req, res) => {
    res.status(201).json({ item: repo.createWorker(requestRole(req), req.body ?? {}) })
  })

  router.patch('/:id', (req, res) => {
    res.json({ item: repo.updateWorker(requestRole(req), param(req, 'id'), req.body ?? {}) })
  })

  router.delete('/:id', (req, res) => {
    repo.removeWorker(param(req, 'id'))
    res.status(204).end()
  })

  router.patch('/:id/employment', (req, res) => {
    res.json(repo.setEmployment(requestRole(req), param(req, 'id'), req.body?.employment))
  })

  router.post('/:id/documents', rawBody, (req, res) => {
    const meta = Object.fromEntries(DOCUMENT_FIELDS.map((key) => [key, trimmed(req.query[key])])) as unknown as DocumentMeta
    res.status(201).json({ item: repo.addDocument(requestRole(req), param(req, 'id'), meta, uploadedFile(req)) })
  })

  router.get('/:id/documents/:docId/file', (req, res) => {
    const { doc, file } = repo.documentFile(param(req, 'id'), param(req, 'docId'))
    sendFile(res, file, doc.fileName)
  })

  router.delete('/:id/documents/:docId', (req, res) => {
    res.json({ item: repo.removeDocument(requestRole(req), param(req, 'id'), param(req, 'docId')) })
  })

  router.put('/:id/photo', rawBody, (req, res) => {
    res.json({ item: repo.setPhoto(requestRole(req), param(req, 'id'), uploadedFile(req)) })
  })

  router.get('/:id/photo', (req, res) => {
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
    sendFile(res, repo.photo(param(req, 'id')))
  })

  router.delete('/:id/photo', (req, res) => {
    res.json({ item: repo.removePhoto(requestRole(req), param(req, 'id')) })
  })

  return router
}

export function brigadesRouter(repo: PersonnelRepository) {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json({ items: repo.listBrigades() })
  })

  router.post('/', (req, res) => {
    res.status(201).json({ item: repo.createBrigade(req.body ?? {}) })
  })

  router.patch('/:id', (req, res) => {
    res.json({ item: repo.updateBrigade(param(req, 'id'), req.body ?? {}) })
  })

  router.patch('/:id/archive', (req, res) => {
    res.json({ item: repo.setBrigadeArchived(param(req, 'id'), req.body?.archived !== false) })
  })

  router.delete('/:id', (req, res) => {
    repo.removeBrigade(param(req, 'id'))
    res.status(204).end()
  })

  return router
}

export function assignmentsRouter(repo: PersonnelRepository, access: AccessStore) {
  const router = Router()

  function actor(req: Request): AssignmentActor {
    const { user } = requestAuth(req)
    return { user, canOverride: access.has(user.role, 'brigades_override') }
  }

  router.get('/', (req, res) => {
    res.json({
      items: repo.listAssignments({
        objectId: trimmed(req.query.objectId) || undefined,
        brigadeId: trimmed(req.query.brigadeId) || undefined,
      }),
    })
  })

  router.get('/crew', (req, res) => {
    const objectId = trimmed(req.query.objectId)
    const date = trimmed(req.query.date)
    if (!objectId) badRequest('Укажите объект')
    if (!isIsoDate(date)) badRequest('Дата должна быть в формате YYYY-MM-DD')
    res.json({ items: repo.crew(objectId, date) })
  })

  router.post('/', (req, res) => {
    res.status(201).json(repo.createAssignment(actor(req), req.body ?? {}))
  })

  router.patch('/:id', (req, res) => {
    res.json(repo.updateAssignment(actor(req), param(req, 'id'), req.body ?? {}))
  })

  router.delete('/:id', (req, res) => {
    repo.removeAssignment(param(req, 'id'))
    res.status(204).end()
  })

  return router
}

export function qualificationsRouter(repo: PersonnelRepository, access: AccessStore) {
  const router = Router()

  router.get('/', (req, res) => {
    const permissions = access.permissionsOf(requestRole(req))
    if (!canReadArea(permissions, 'personnel') && !canReadArea(permissions, 'brigades')) {
      forbidden(areaDeniedMessage('personnel', false))
    }
    res.json({ item: { types: QUALIFICATION_TYPES, requirements: repo.requirements() } })
  })

  router.put('/requirements', (req, res) => {
    access.requirePermission(requestRole(req), 'settings_manage')
    res.json({ items: repo.setRequirements(req.body?.requirements) })
  })

  return router
}
