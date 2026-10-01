import { persisted, type Storage } from '../../db.js'
import { badRequest, notFound, nowIso, trimmed, uid } from '../../http.js'
import {
  reportStoragePath,
  validateReportDraft,
  type DailyReport,
  type DailyReportDraft,
  type DronePeriod,
  type ReportWorkItem,
} from '../../shared.js'
import type { ContractsRepository } from '../contracts/repository.js'
import { reportsSeed } from './seed.js'

function byDateDesc(a: DailyReport, b: DailyReport) {
  return b.date.localeCompare(a.date)
}

function parseDraft(body: Partial<DailyReportDraft>): DailyReportDraft {
  const periods: DronePeriod[] = Array.isArray(body.dronePeriods) ? body.dronePeriods : []
  const workItems: ReportWorkItem[] = Array.isArray(body.workItems) ? body.workItems : []
  const draft: DailyReportDraft = {
    objectId: trimmed(body.objectId),
    date: trimmed(body.date),
    authorName: trimmed(body.authorName),
    workStartFrom: trimmed(body.workStartFrom),
    workStartTo: trimmed(body.workStartTo),
    estimatedCompletion: trimmed(body.estimatedCompletion),
    dronePeriods: periods
      .map((p) => ({ from: trimmed(p?.from), to: trimmed(p?.to) }))
      .filter((p) => p.from || p.to),
    staffItr: trimmed(body.staffItr),
    staffForemen: trimmed(body.staffForemen),
    staffWorkers: trimmed(body.staffWorkers),
    workStage: trimmed(body.workStage),
    techMeans: trimmed(body.techMeans),
    volumes: trimmed(body.volumes),
    workItems: workItems.map((w) => ({
      itemId: trimmed(w?.itemId),
      name: trimmed(w?.name),
      unit: trimmed(w?.unit),
      volume: Number(w?.volume) || 0,
    })),
    ppe: trimmed(body.ppe),
    nextDay: trimmed(body.nextDay),
    problems: trimmed(body.problems),
  }
  const error = validateReportDraft(draft)
  if (error) badRequest(error)
  return draft
}

export function createReportsRepository(contracts: ContractsRepository, storage: Storage) {
  const snapshot = storage.snapshot<DailyReport[]>('reports', { seed: reportsSeed, empty: () => [] })
  let reports = snapshot.state

  const repository = {
    hasReports(objectId: string): boolean {
      return reports.some((r) => r.objectId === objectId)
    },

    list(objectId?: string): DailyReport[] {
      const list = objectId ? reports.filter((r) => r.objectId === objectId) : reports
      return structuredClone(list).sort(byDateDesc)
    },

    dates(objectId: string): string[] {
      return [...new Set(reports.filter((r) => r.objectId === objectId).map((r) => r.date))].sort((a, b) =>
        b.localeCompare(a),
      )
    },

    get(objectId: string, date: string): DailyReport {
      const report = reports.find((r) => r.objectId === objectId && r.date === date)
      if (!report) notFound('Отчёта за эту дату нет')
      return structuredClone(report)
    },

    save(body: Partial<DailyReportDraft>): DailyReport {
      const draft = parseDraft(body)
      if (!contracts.findObject(draft.objectId)) notFound('Объект не найден')
      const now = nowIso()
      const existing = reports.find((r) => r.objectId === draft.objectId && r.date === draft.date)
      const report: DailyReport = {
        ...draft,
        id: existing?.id ?? uid('r'),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        storagePath: reportStoragePath(draft.objectId, draft.date),
      }
      reports = [report, ...reports.filter((r) => r.id !== report.id)]
      return structuredClone(report)
    },
  }

  return persisted(repository, ['save'], () => snapshot.save(reports))
}

export type ReportsRepository = ReturnType<typeof createReportsRepository>
