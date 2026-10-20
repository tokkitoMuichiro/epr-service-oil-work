import { Router } from 'express'
import type { AuditLog } from '../../db.js'
import { badRequest, conflict, param, requestUser, trimmed } from '../../http.js'
import { log } from '../../log.js'
import { formatReportBitrixComment, isIsoDate } from '../../shared.js'
import type { BitrixTasks } from '../bitrix-tasks/index.js'
import type { ContractsRepository } from '../contracts/repository.js'
import type { ReportsRepository } from './repository.js'

export interface ReportsBitrix {
  tasks: BitrixTasks
  audit?: AuditLog
}

export function reportsRouter(reports: ReportsRepository, contracts: ContractsRepository, bitrix?: ReportsBitrix) {
  const router = Router()
  const tasks = bitrix?.tasks

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

  router.post('/', async (req, res) => {
    const body = req.body ?? {}
    const objectId = trimmed(body.objectId)
    const found = contracts.findObject(objectId)
    if (!found) badRequest('Объект не найден')
    const taskId = found.object.bitrixTaskId
    if (!taskId) conflict('По объекту нет привязанной задачи Битрикс — отчёт недоступен')
    if (tasks) {
      const active = await tasks.isActive(taskId)
      if (!active) conflict('Задача Битрикс не в статусе «В работе» — отчёт недоступен')
    }

    const item = reports.save(body)
    let bitrixWarning: string | undefined
    if (tasks) {
      try {
        await tasks.addComment(taskId, formatReportBitrixComment(item))
      } catch (error) {
        bitrixWarning = error instanceof Error ? error.message : 'Не удалось отправить отчёт в задачу Битрикс'
        log.warn('Не удалось отправить ежедневный отчёт в задачу Битрикс', error)
        const user = requestUser(req)
        bitrix?.audit?.record({
          userId: user.id,
          userName: user.fullName,
          action: 'report_bitrix_comment_failed',
          details: JSON.stringify({ objectId, taskId, reportId: item.id, error: bitrixWarning }),
        })
      }
    }
    res.json({ item, ...(bitrixWarning ? { bitrixWarning } : {}) })
  })

  return router
}
