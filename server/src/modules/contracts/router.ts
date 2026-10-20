import { Router } from 'express'
import { badRequest, conflict, notFound, param, sendFile, trimmed } from '../../http.js'
import {
  isObjectArchived,
  objectStatus,
  reportDaysOf,
  todayIso,
  type BitrixTaskBinding,
  type DailyReport,
  type ObjectStatusChange,
} from '../../shared.js'
import { XLSX_MIME } from '../../excel.js'
import type { BitrixTasks } from '../bitrix-tasks/index.js'
import { objectWorkbook, summaryWorkbook } from './excel.js'
import type { ContractsRepository } from './repository.js'

export interface ObjectLifecycle {
  /** Reports or past assignments forbid physical deletion. */
  hasHistory(objectId: string): boolean
  /** A brigade is working on the object today. */
  isBusy(objectId: string): boolean
  removed(objectId: string): void
  archived(objectId: string): void
  /** Brigades must not stay on a finished object after its last working day. */
  completed(objectId: string, lastDay: string): void
}

export interface ScheduleSources {
  /** Daily reports are the only source of actual progress on the schedule. */
  reports(): DailyReport[]
  today?: () => string
}

export interface ContractsBitrix {
  tasks: BitrixTasks
}

function sendWorkbook(res: Parameters<typeof sendFile>[0], data: Buffer, fileName: string) {
  sendFile(res, { data, mimeType: XLSX_MIME }, fileName)
}

function parseBitrixTaskBody(body: unknown): BitrixTaskBinding | undefined {
  if (!body || typeof body !== 'object') return undefined
  const raw = body as Record<string, unknown>
  const mode = trimmed(raw.mode)
  if (mode === 'create') return { mode: 'create', title: trimmed(raw.title) || undefined }
  if (mode === 'link') return { mode: 'link', taskRef: trimmed(raw.taskRef) || trimmed(raw.taskId) }
  return undefined
}

export function contractsRouter(
  repo: ContractsRepository,
  objects: ObjectLifecycle,
  sources: ScheduleSources,
  bitrix?: ContractsBitrix,
) {
  const router = Router()
  const today = () => sources.today?.() ?? todayIso()
  const tasks = bitrix?.tasks

  function assertCanArchive(objectIds: string[]) {
    if (objectIds.some(objects.isBusy)) conflict('На объекте сейчас работает бригада — сначала завершите назначение')
  }

  router.get('/', (_req, res) => {
    res.json({ items: repo.list() })
  })

  router.get('/report-days', (_req, res) => {
    res.json({ items: reportDaysOf(sources.reports()) })
  })

  router.get('/export.xlsx', (req, res) => {
    const objectId = trimmed(req.query.objectId)
    const contractId = trimmed(req.query.contractId)
    const isArchive = req.query.archive === '1'
    const reports = sources.reports()
    const contracts = repo.list()

    if (objectId) {
      const contract = contracts.find((c) => c.objects.some((o) => o.id === objectId))
      const object = contract?.objects.find((o) => o.id === objectId)
      if (!contract || !object) notFound('Объект не найден')
      sendWorkbook(res, objectWorkbook({ contract, object, reports, today: today() }), `График — ${object.name}.xlsx`)
      return
    }

    const selected = contractId ? contracts.filter((c) => c.id === contractId) : contracts
    if (contractId && !selected.length) notFound('Договор не найден')
    const visible = selected
      .map((c) => ({ ...c, objects: c.objects.filter((o) => isObjectArchived(c, o) === isArchive) }))
      .filter((c) => contractId || c.objects.length)
    const title = contractId
      ? `График договора «${selected[0].name}»${isArchive ? ' — архив' : ''}`
      : `Сводный график${isArchive ? ' — архив' : ''}`
    sendWorkbook(res, summaryWorkbook({ title, contracts: visible, reports, today: today() }), `${title.replace(/[«»]/g, '')}.xlsx`)
  })

  router.get('/:id', (req, res) => {
    res.json({ item: repo.get(param(req, 'id')) })
  })

  router.post('/', (req, res) => {
    res.status(201).json({ item: repo.create(req.body ?? {}) })
  })

  router.patch('/:id', (req, res) => {
    res.json({ item: repo.update(param(req, 'id'), req.body ?? {}) })
  })

  router.delete('/:id', (req, res) => {
    const contract = repo.get(param(req, 'id'))
    if (contract.objects.some((o) => objects.hasHistory(o.id))) {
      conflict('По договору есть отчёты или прошлые назначения — отправьте его в архив')
    }
    repo.remove(contract.id)
    contract.objects.forEach((o) => objects.removed(o.id))
    res.status(204).end()
  })

  router.patch('/:id/archive', (req, res) => {
    const archived = req.body?.archived !== false
    const contract = repo.get(param(req, 'id'))
    const ids = contract.objects.map((o) => o.id)
    if (archived) assertCanArchive(ids)
    const item = repo.setArchived(contract.id, archived)
    if (archived) ids.forEach(objects.archived)
    res.json({ item })
  })

  router.post('/:id/objects', (req, res) => {
    res.status(201).json({ item: repo.addObject(param(req, 'id'), req.body ?? {}) })
  })

  router.patch('/:id/objects/:objectId', (req, res) => {
    res.json({ item: repo.updateObject(param(req, 'id'), param(req, 'objectId'), req.body ?? {}) })
  })

  router.delete('/:id/objects/:objectId', (req, res) => {
    const objectId = param(req, 'objectId')
    if (objects.hasHistory(objectId)) {
      conflict('По объекту есть отчёты или прошлые назначения — отправьте его в архив')
    }
    const item = repo.removeObject(param(req, 'id'), objectId)
    objects.removed(objectId)
    res.json({ item })
  })

  router.patch('/:id/objects/:objectId/archive', (req, res) => {
    const archived = req.body?.archived !== false
    const objectId = param(req, 'objectId')
    if (archived) assertCanArchive([objectId])
    const item = repo.setObjectArchived(param(req, 'id'), objectId, archived)
    if (archived) objects.archived(objectId)
    res.json({ item })
  })

  router.patch('/:id/objects/:objectId/status', async (req, res) => {
    const contractId = param(req, 'id')
    const objectId = param(req, 'objectId')
    const body = (req.body ?? {}) as Partial<ObjectStatusChange> & { bitrixTask?: unknown }
    const found = repo.findObject(objectId)
    if (!found || found.contract.id !== contractId) notFound('Объект не найден')
    const { contract, object } = found
    const from = objectStatus(object)
    const starting = from === 'planned' && body.status === 'in_progress'

    let bitrixTaskId = object.bitrixTaskId ?? undefined
    let bitrixTaskTitle = object.bitrixTaskTitle ?? undefined
    if (starting) {
      if (!tasks) badRequest('Привязка задач Битрикс недоступна')
      const binding = parseBitrixTaskBody(body.bitrixTask) ?? body.bitrixTask
      if (!binding || typeof binding !== 'object' || !('mode' in binding)) {
        badRequest('Выберите: создать задачу в Битрикс или привязать существующую')
      }
      const resolved = await tasks.resolveBinding(binding as BitrixTaskBinding, {
        title: `${object.name} — ${contract.name}`,
        description: `Объект ERP: ${object.name}\nДоговор: ${contract.name}\nЗаказчик: ${contract.customer}`,
      })
      bitrixTaskId = resolved.id
      bitrixTaskTitle = resolved.title
    }

    const item = repo.setObjectStatus(contractId, objectId, {
      ...body,
      bitrixTaskId,
      bitrixTaskTitle,
    })
    const actualEnd = item.objects.find((o) => o.id === objectId)?.actualEnd
    if (actualEnd) objects.completed(objectId, actualEnd)
    res.json({ item })
  })

  router.put('/:id/objects/:objectId/bitrix-task', async (req, res) => {
    if (!tasks) badRequest('Привязка задач Битрикс недоступна')
    const contractId = param(req, 'id')
    const objectId = param(req, 'objectId')
    const found = repo.findObject(objectId)
    if (!found || found.contract.id !== contractId) notFound('Объект не найден')
    const binding = parseBitrixTaskBody(req.body)
    if (!binding) badRequest('Укажите mode: create или link')
    const resolved = await tasks.resolveBinding(binding, {
      title: `${found.object.name} — ${found.contract.name}`,
      description: `Объект ERP: ${found.object.name}`,
    })
    res.json({ item: repo.setObjectBitrixTask(contractId, objectId, { id: resolved.id, title: resolved.title }) })
  })

  router.post('/:id/objects/:objectId/works', (req, res) => {
    res.status(201).json({ item: repo.addWork(param(req, 'id'), param(req, 'objectId'), req.body ?? {}) })
  })

  router.patch('/:id/objects/:objectId/works/:workId', (req, res) => {
    res.json({
      item: repo.updateWork(param(req, 'id'), param(req, 'objectId'), param(req, 'workId'), req.body ?? {}),
    })
  })

  router.delete('/:id/objects/:objectId/works/:workId', (req, res) => {
    res.json({ item: repo.removeWork(param(req, 'id'), param(req, 'objectId'), param(req, 'workId')) })
  })

  return router
}
