import { existsSync } from 'node:fs'
import path from 'node:path'
import cors from 'cors'
import express from 'express'
import { createAuditLog, createStorage, openDatabase, type Database, type DatabaseSeed } from './db.js'
import { errorHandler, notFound } from './http.js'
import { accessRouter } from './modules/access/router.js'
import { createAccessStore } from './modules/access/store.js'
import { createUserRepository } from './modules/auth/repository.js'
import { authRouter, authenticate, requireSession, usersRouter } from './modules/auth/router.js'
import { createContractsRepository } from './modules/contracts/repository.js'
import { contractsRouter } from './modules/contracts/router.js'
import { createEquipmentService } from './modules/equipment/service.js'
import { equipmentRouter } from './modules/equipment/router.js'
import { createPersonnelRepository } from './modules/personnel/repository.js'
import {
  assignmentsRouter,
  brigadesRouter,
  personnelRouter,
  qualificationsRouter,
} from './modules/personnel/router.js'
import { createReportsRepository } from './modules/reports/repository.js'
import { reportsRouter } from './modules/reports/router.js'
import { createTrainingStorage, type BitrixConfig } from './modules/training/bitrix.js'
import { publicTestRouter } from './modules/training/public-router.js'
import { createTrainingRepository, type TrainingRepository } from './modules/training/repository.js'
import { trainingRouter } from './modules/training/router.js'

export interface AppOptions {
  clientDist?: string
  today?: () => string
  /** Defaults to an in-memory database (tests). */
  db?: Database
  /** Initial content for a brand-new database (local demo dataset). */
  seed?: DatabaseSeed
  /** Dev only: demo users per role and password-less switching between them. */
  devLogin?: boolean
  /** Bootstrap administrator; created once if the login does not exist yet. */
  admin?: { login: string; password: string }
  secureCookies?: boolean
  trustProxy?: boolean
  /** Only for a client served from another origin; same-origin deployments need no CORS. */
  corsOrigins?: string[]
  /** Base address for knowledge-check links; defaults to the request origin. */
  publicUrl?: string
  bitrix?: BitrixConfig
}

export function createApp(options: AppOptions = {}) {
  const db = options.db ?? openDatabase()
  const storage = createStorage(db, { seed: options.seed })
  const audit = createAuditLog(db)
  const users = createUserRepository(db)
  const access = createAccessStore(storage)
  const contracts = createContractsRepository(storage)
  const reports = createReportsRepository(contracts, storage)
  const equipment = createEquipmentService(storage, {
    users: () => users.list(),
    permissionsOf: (role) => access.equipmentPermissionsOf(role),
  })
  let training: TrainingRepository | null = null
  const personnel = createPersonnelRepository(contracts, storage, {
    today: options.today,
    equipmentOf: (worker) => equipment.itemsOwnedBy(worker),
    audit,
    onFired: (workerId) => training?.cancelForWorker(workerId, 'Сотрудник уволен') ?? 0,
  })
  training = createTrainingRepository(storage, createTrainingStorage(storage, options.bitrix), {
    workers: () => personnel.directory(),
    today: options.today,
    audit,
  })

  if (options.admin) {
    users.ensure({ ...options.admin, fullName: 'Администратор', role: 'admin', workerId: null, active: true })
  }
  if (options.devLogin) users.ensureDemoUsers()

  const app = express()
  app.disable('x-powered-by')
  if (options.trustProxy) app.set('trust proxy', 1)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'SAMEORIGIN')
    res.setHeader('Referrer-Policy', 'same-origin')
    next()
  })
  if (options.corsOrigins?.length) app.use(cors({ origin: options.corsOrigins, credentials: true }))
  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'erp-ammir-api', time: new Date().toISOString() })
  })

  const api = express.Router()
  api.use(authenticate(users))
  api.get('/', (_req, res) => {
    res.json({
      name: 'ERP АММИР API',
      version: '0.5.0',
      modules: [
        'auth',
        'users',
        'access',
        'contracts',
        'reports',
        'equipment',
        'personnel',
        'brigades',
        'assignments',
        'qualifications',
        'training',
      ],
      storage: 'sqlite',
      bitrix: options.bitrix?.mode === 'live' ? 'live' : 'mock',
    })
  })
  api.use('/auth', authRouter(users, { devLogin: Boolean(options.devLogin), secureCookies: options.secureCookies }))
  api.use('/public/test/:token', publicTestRouter(training, { secureCookies: options.secureCookies }))
  api.use(requireSession)
  api.use('/users', usersRouter(users, access))
  api.use('/access', accessRouter(access))
  api.use(
    '/contracts',
    access.guard('contracts'),
    contractsRouter(contracts, {
      hasHistory: (objectId) => reports.hasReports(objectId) || personnel.hasObjectHistory(objectId),
      isBusy: (objectId) => personnel.isObjectBusy(objectId),
      removed: (objectId) => personnel.removeAssignmentsForObject(objectId),
      archived: (objectId) => personnel.removeFutureAssignmentsForObject(objectId),
    }),
  )
  api.use('/reports', access.guard('reports'), reportsRouter(reports, contracts))
  api.use('/equipment', equipmentRouter(equipment))
  api.use('/personnel', access.guard('personnel'), personnelRouter(personnel))
  api.use('/qualifications', qualificationsRouter(personnel, access))
  api.use('/brigades', access.guard('brigades'), brigadesRouter(personnel))
  api.use('/assignments', access.guard('brigades'), assignmentsRouter(personnel, access))
  api.use('/training', trainingRouter(training, access, { publicUrl: options.publicUrl }))
  api.use(() => notFound('Метод API не найден'))
  app.use('/api', api)

  const clientDist = options.clientDist ? path.resolve(options.clientDist) : null
  if (clientDist && existsSync(clientDist)) {
    app.use(
      express.static(clientDist, {
        index: false,
        maxAge: '1h',
        setHeaders: (res, file) => {
          if (/(?:^|[\\/])assets[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          else if (/(?:sw\.js|registerSW\.js|manifest\.webmanifest)$/.test(file)) res.setHeader('Cache-Control', 'no-cache')
        },
      }),
    )
    app.get(/^(?!\/api\/|\/health$).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(path.join(clientDist, 'index.html'))
    })
  }

  app.use(errorHandler)
  return app
}
