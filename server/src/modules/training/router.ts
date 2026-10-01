import { Router, type Request, type RequestHandler } from 'express'
import { param, rawBody as rawBodyOf, requestAuth, requestRole, sendFile, trimmed, uploadedFile } from '../../http.js'
import { MATERIAL_MAX_BYTES, type Permission } from '../../shared.js'
import type { AccessStore } from '../access/store.js'
import type { Actor, TrainingRepository } from './repository.js'

const rawBody = rawBodyOf(MATERIAL_MAX_BYTES)

export interface TrainingRouterOptions {
  /** Public address of the app for links; without it the request origin is used. */
  publicUrl?: string
}

export function requestOrigin(req: Request, publicUrl?: string): string {
  if (publicUrl) return publicUrl
  const origin = req.get('origin')
  if (origin && origin !== 'null') return origin
  const referer = req.get('referer')
  if (referer) {
    try {
      return new URL(referer).origin
    } catch {
      // fall through to the host header
    }
  }
  return `${req.protocol}://${req.get('host')}`
}

function query(req: Request, name: string): string | undefined {
  return trimmed(req.query[name]) || undefined
}

export function trainingRouter(repo: TrainingRepository, access: AccessStore, options: TrainingRouterOptions = {}) {
  const router = Router()

  const need =
    (permission: Permission): RequestHandler =>
    (req, _res, next) => {
      access.requirePermission(requestRole(req), permission)
      next()
    }

  function actor(req: Request): Actor {
    const { user } = requestAuth(req)
    return { id: user.id, fullName: user.fullName }
  }

  const origin = (req: Request) => requestOrigin(req, options.publicUrl)

  router.get('/storage/check', need('settings_manage'), async (_req, res) => {
    res.json({ item: await repo.checkStorage() })
  })

  router.use(need('training_view'))

  router.get('/directions', (_req, res) => {
    res.json({ items: repo.listDirections() })
  })

  router.post('/directions', need('training_manage'), (req, res) => {
    res.status(201).json({ item: repo.createDirection(req.body ?? {}) })
  })

  router.patch('/directions/:id', need('training_manage'), (req, res) => {
    res.json({ item: repo.updateDirection(param(req, 'id'), req.body ?? {}) })
  })

  router.post('/directions/:id/programs', need('training_manage'), async (req, res) => {
    res.status(201).json({ item: await repo.createProgram(param(req, 'id'), req.body ?? {}) })
  })

  router.patch('/directions/:id/programs/:programId', need('training_manage'), (req, res) => {
    res.json({ item: repo.updateProgram(param(req, 'id'), param(req, 'programId'), req.body ?? {}) })
  })

  router.get('/materials', (req, res) => {
    res.json({ items: repo.listMaterials({ programId: query(req, 'programId'), q: query(req, 'q') }) })
  })

  router.post('/materials', need('training_manage'), async (req, res) => {
    res.status(201).json({ item: await repo.createLinkMaterial(actor(req), req.body ?? {}) })
  })

  router.post('/materials/upload', need('training_manage'), rawBody, async (req, res) => {
    const programIds = [query(req, 'programIds'), query(req, 'programId')]
      .filter(Boolean)
      .flatMap((v) => (v as string).split(','))
      .map((v) => v.trim())
      .filter(Boolean)
    const meta = {
      title: trimmed(req.query.title),
      programIds: [...new Set(programIds)],
      description: trimmed(req.query.description),
      fileName: trimmed(req.query.fileName),
    }
    res.status(201).json({ item: await repo.uploadMaterial(actor(req), meta, uploadedFile(req)) })
  })

  router.get('/materials/:id/file', async (req, res) => {
    const { material, file } = await repo.materialFile(param(req, 'id'))
    sendFile(res, file, material.fileName)
  })

  router.patch('/materials/:id', need('training_manage'), (req, res) => {
    res.json({ item: repo.updateMaterial(actor(req), param(req, 'id'), req.body ?? {}) })
  })

  router.delete('/materials/:id', need('training_manage'), (req, res) => {
    repo.removeMaterial(param(req, 'id'))
    res.status(204).end()
  })

  router.get('/tests', (req, res) => {
    res.json({
      items: repo.listTests({
        programId: query(req, 'programId'),
        status: query(req, 'status'),
        personnelKind: query(req, 'personnelKind'),
        group: query(req, 'group'),
        voltage: query(req, 'voltage'),
      }),
    })
  })

  router.post('/tests', need('training_manage'), (req, res) => {
    res.status(201).json({ item: repo.createTest(actor(req), req.body ?? {}) })
  })

  router.get('/tests/:id', need('training_manage'), (req, res) => {
    res.json({ item: repo.getTest(param(req, 'id')) })
  })

  router.patch('/tests/:id', need('training_manage'), (req, res) => {
    res.json({ item: repo.updateTest(actor(req), param(req, 'id'), req.body ?? {}) })
  })

  router.post('/tests/:id/publish', need('training_manage'), (req, res) => {
    res.json({ item: repo.publishTest(actor(req), param(req, 'id')) })
  })

  router.post('/tests/:id/archive', need('training_manage'), (req, res) => {
    res.json({ item: repo.archiveTest(actor(req), param(req, 'id')) })
  })

  router.delete('/tests/:id', need('training_manage'), (req, res) => {
    repo.removeTest(param(req, 'id'))
    res.status(204).end()
  })

  router.post('/tests/:id/images', need('training_manage'), rawBody, async (req, res) => {
    res.status(201).json({ item: await repo.uploadQuestionImage(param(req, 'id'), trimmed(req.query.fileName), uploadedFile(req)) })
  })

  router.get('/tests/:id/images/:fileId', need('training_manage'), async (req, res) => {
    res.setHeader('Cache-Control', 'private, max-age=86400')
    sendFile(res, await repo.testImage(param(req, 'id'), param(req, 'fileId')))
  })

  router.get('/assignments', (req, res) => {
    res.json({
      items: repo.listAssignments({
        workerId: query(req, 'workerId'),
        testId: query(req, 'testId'),
        programId: query(req, 'programId'),
        status: query(req, 'status'),
        kind: query(req, 'kind'),
      }),
    })
  })

  router.post('/assignments', need('training_assign'), (req, res) => {
    res.status(201).json(repo.createAssignments(actor(req), req.body ?? {}, origin(req)))
  })

  router.get('/assignments/:id/link', need('training_assign'), (req, res) => {
    res.json({ item: repo.link(param(req, 'id'), origin(req)) })
  })

  router.post('/assignments/:id/reissue', need('training_assign'), (req, res) => {
    res.json({ item: repo.reissue(actor(req), param(req, 'id'), origin(req)) })
  })

  router.post('/assignments/:id/cancel', need('training_assign'), (req, res) => {
    res.json({ item: repo.cancel(actor(req), param(req, 'id'), req.body?.reason) })
  })

  router.get('/workers/:id/certifications', (req, res) => {
    res.json({ item: repo.workerCertifications(param(req, 'id')) })
  })

  router.get('/attempts/:id', need('training_results'), (req, res) => {
    res.json({ item: repo.attempt(param(req, 'id')) })
  })

  router.post('/records/:id/annul', need('training_results'), (req, res) => {
    res.json({ item: repo.annulRecord(actor(req), param(req, 'id'), req.body?.reason) })
  })

  router.get('/summary', (_req, res) => {
    res.json({ item: repo.summary() })
  })

  return router
}
