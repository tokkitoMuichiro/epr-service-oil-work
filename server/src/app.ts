import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import cors from 'cors'
import express from 'express'
import { compressJson, precompressedFiles } from './compression.js'
import {
  createAuditLog,
  createStorage,
  openDatabase,
  snapshotSizes,
  type Database,
  type DatabaseSeed,
  type Storage,
} from './db.js'
import { createDisk, type BitrixConfig, type Disk } from './disk/index.js'
import { diskRouter } from './disk/router.js'
import { createDiskSync, scheduleDiskSync } from './disk/sync.js'
import { errorHandler, notFound } from './http.js'
import { log } from './log.js'
import { bitrixFrameAncestors, bitrixFramedRootPage, securityHeaders, spaContentSecurityPolicy } from './security.js'
import { accessRouter } from './modules/access/router.js'
import { createAccessStore } from './modules/access/store.js'
import { bitrixDirectoryFromConfig, bitrixSsoFromConfig, portalOrigin } from './modules/auth/bitrix.js'
import { createUserRepository } from './modules/auth/repository.js'
import { createBitrixUserSync } from './modules/auth/sync.js'
import { authRouter, authenticate, requireSession, usersRouter } from './modules/auth/router.js'
import { bitrixTasksFromConfig } from './modules/bitrix-tasks/index.js'
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
import { overviewRouter } from './modules/overview/router.js'
import { createReportsRepository } from './modules/reports/repository.js'
import { reportsRouter } from './modules/reports/router.js'
import { createTrainingStorage } from './modules/training/bitrix.js'
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
  /** Replaces `fetch` for every Bitrix24 call (tests). */
  bitrixFetch?: typeof fetch
  /** Overrides the Disk built from `bitrix` (tests). */
  disk?: (storage: Storage) => Disk
  /** Overrides Bitrix tasks API (tests). */
  bitrixTasks?: import('./modules/bitrix-tasks/index.js').BitrixTasks
  /** Background check for files deleted on Disk; off when not set. */
  diskSyncMs?: number
  /** Release tag of the running image, shown by `/health`. */
  version?: string
}

function staticCacheControl(relative: string): string {
  if (/(?:^|[\\/])assets[\\/]/.test(relative)) return 'public, max-age=31536000, immutable'
  if (/(?:sw\.js|registerSW\.js|manifest\.webmanifest)$/.test(relative)) return 'no-cache'
  return 'public, max-age=3600'
}

export function createApp(options: AppOptions = {}) {
  const db = options.db ?? openDatabase()
  const storage = createStorage(db, { seed: options.seed })
  const audit = createAuditLog(db)
  const users = createUserRepository(db)
  const access = createAccessStore(storage)
  const contracts = createContractsRepository(storage, { today: options.today })
  const reports = createReportsRepository(contracts, storage)
  const bitrix = options.bitrix ?? {}
  const disk = options.disk?.(storage) ?? createDisk(storage, bitrix, options.bitrixFetch)
  const bitrixSso = bitrixSsoFromConfig(bitrix, options.bitrixFetch)
  const bitrixDirectory = bitrixDirectoryFromConfig(bitrix, options.bitrixFetch)
  const bitrixTasks = options.bitrixTasks ?? bitrixTasksFromConfig(bitrix, options.bitrixFetch)
  const bitrixPortal =
    bitrixSso?.portal ??
    (bitrix.portal?.trim()
      ? portalOrigin(bitrix.portal)
      : bitrix.webhookUrl?.trim()
        ? portalOrigin(bitrix.webhookUrl)
        : null)
  const equipment = createEquipmentService(storage, {
    disk,
    users: () => users.list(),
    permissionsOf: (role) => access.equipmentPermissionsOf(role),
  })
  let training: TrainingRepository | null = null
  const personnel = createPersonnelRepository(contracts, storage, {
    disk,
    today: options.today,
    equipmentOf: (worker) => equipment.itemsOwnedBy(worker),
    audit,
    onFired: (workerId) => training?.cancelForWorker(workerId, 'Сотрудник уволен') ?? 0,
    knowledgeIssues: (memberIds) => training?.knowledgeIssuesFor(memberIds) ?? [],
  })
  training = createTrainingRepository(storage, createTrainingStorage(disk), {
    workers: () => personnel.directory(),
    brigades: () => personnel.listBrigades(),
    today: options.today,
    audit,
  })
  const diskSync = createDiskSync(disk, [personnel, equipment, training], audit)
  const bitrixUserSync = createBitrixUserSync(bitrixDirectory, users, audit)
  if (options.diskSyncMs) {
    scheduleDiskSync(diskSync, options.diskSyncMs, (error) => log.error('Синхронизация с Диском Битрикс не удалась', error))
    scheduleDiskSync(bitrixUserSync, options.diskSyncMs, (error) => log.error('Проверка уволенных в Битрикс24 не удалась', error))
  }

  if (options.admin) {
    users.ensure({ ...options.admin, fullName: 'Администратор', role: 'admin', workerId: null, active: true })
  }
  if (options.devLogin) users.ensureDemoUsers()

  const app = express()
  app.disable('x-powered-by')
  if (options.trustProxy) app.set('trust proxy', 1)
  app.use(securityHeaders)
  if (options.corsOrigins?.length) app.use(cors({ origin: options.corsOrigins, credentials: true }))
  app.use(express.json({ limit: '1mb' }))
  app.use(compressJson())

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'erp-ammir-api', version: options.version ?? 'dev', time: new Date().toISOString() })
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
        'overview',
      ],
      storage: 'sqlite',
      bitrix: disk.mode,
    })
  })
  api.use(
    '/auth',
    authRouter(users, { devLogin: Boolean(options.devLogin), secureCookies: options.secureCookies, bitrix: bitrixSso }),
  )
  api.use('/public/test/:token', publicTestRouter(training, { secureCookies: options.secureCookies }))
  api.use(requireSession)
  api.use(
    '/users',
    usersRouter(users, access, bitrixDirectory, bitrixUserSync, audit, () => snapshotSizes(db)),
  )
  api.use('/disk', diskRouter(disk, diskSync, access))
  api.use('/access', accessRouter(access))
  api.use(
    '/contracts',
    access.guard('contracts'),
    contractsRouter(
      contracts,
      {
        hasHistory: (objectId) => reports.hasReports(objectId) || personnel.hasObjectHistory(objectId),
        isBusy: (objectId) => personnel.isObjectBusy(objectId),
        removed: (objectId) => personnel.removeAssignmentsForObject(objectId),
        archived: (objectId) => personnel.removeFutureAssignmentsForObject(objectId),
        completed: (objectId, lastDay) => personnel.closeAssignmentsForObject(objectId, lastDay),
      },
      { reports: () => reports.list(), today: options.today },
      { tasks: bitrixTasks },
    ),
  )
  api.use(
    '/reports',
    access.guard('reports'),
    reportsRouter(reports, contracts, { tasks: bitrixTasks, audit }),
  )
  api.use('/equipment', equipmentRouter(equipment))
  api.use('/personnel', access.guard('personnel'), personnelRouter(personnel))
  api.use('/qualifications', qualificationsRouter(personnel, access))
  api.use('/brigades', access.guard('brigades'), brigadesRouter(personnel))
  api.use('/assignments', access.guard('brigades'), assignmentsRouter(personnel, access))
  api.use('/training', trainingRouter(training, access, { publicUrl: options.publicUrl }))
  api.use('/overview', overviewRouter({ access, contracts, reports, equipment, personnel, training, today: options.today }))
  api.use(() => notFound('Метод API не найден'))
  app.use('/api', api)

  const clientDist = options.clientDist ? path.resolve(options.clientDist) : null
  if (clientDist && existsSync(clientDist)) {
    const indexFile = path.join(clientDist, 'index.html')
    const indexHtml = existsSync(indexFile) ? readFileSync(indexFile, 'utf8') : ''
    const csp = spaContentSecurityPolicy(indexHtml)
    const embedAncestors = bitrixFrameAncestors(bitrixPortal)
    const embedCsp = spaContentSecurityPolicy(indexHtml, embedAncestors)
    const precompressed = precompressedFiles(clientDist)
    // PWA navigateFallback caches `/index.html`. If that response has X-Frame-Options, Bitrix
    // iframes (esp. Yandex) get ERR_BLOCKED_BY_RESPONSE even for `/e/*`. When Bitrix is configured,
    // the shell must always be frameable by the portal.
    function applyEmbedFrameHeaders(res: express.Response) {
      res.removeHeader('X-Frame-Options')
      res.removeHeader('Cross-Origin-Opener-Policy')
      res.setHeader('Content-Security-Policy', embedCsp)
    }

    app.use((req, res, next) => {
      const relative = req.path.slice(1)
      const isGet = req.method === 'GET' || req.method === 'HEAD'
      if (relative === 'index.html' && bitrixPortal) applyEmbedFrameHeaders(res)
      if (!isGet || !precompressed.send(res, relative, req.headers['accept-encoding'], staticCacheControl(relative))) next()
    })
    app.use(
      express.static(clientDist, {
        index: false,
        maxAge: '1h',
        setHeaders: (res, file) => {
          const relative = path.relative(clientDist, file).split(path.sep).join('/')
          if (relative === 'index.html' && bitrixPortal) {
            applyEmbedFrameHeaders(res)
            res.setHeader('Cache-Control', 'no-cache')
            return
          }
          res.setHeader('Cache-Control', staticCacheControl(relative))
        },
      }),
    )
    app.get(/^(?!\/api\/|\/health$).*/, (req, res) => {
      const isEmbed = req.path === '/e' || req.path.startsWith('/e/')
      // Non-embed path opened as iframe: short gate (open in tab) instead of full ERP chrome.
      const isIframe = req.get('sec-fetch-dest') === 'iframe'
      if (isIframe && !isEmbed && bitrixPortal) {
        res.removeHeader('X-Frame-Options')
        res.removeHeader('Cross-Origin-Opener-Policy')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader(
          'Content-Security-Policy',
          `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors ${embedAncestors}`,
        )
        res.type('html').send(bitrixFramedRootPage())
        return
      }
      res.setHeader('Cache-Control', 'no-cache')
      if (isEmbed || bitrixPortal) applyEmbedFrameHeaders(res)
      else res.setHeader('Content-Security-Policy', csp)
      if (!precompressed.send(res, 'index.html', req.headers['accept-encoding'], 'no-cache')) res.sendFile(indexFile)
    })
  }

  app.use(errorHandler)
  return app
}
