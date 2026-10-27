import { persisted, type Database, type Storage } from '../../db.js'
import { badRequest, notFound, nowIso, trimmed, uid } from '../../http.js'
import {
  parseReportVolume,
  reportStoragePath,
  validateReportDraft,
  type DailyReport,
  type DailyReportDraft,
  type DronePeriod,
  type ReportWorkItem,
} from '../../shared.js'
import type { ContractsRepository } from '../contracts/repository.js'

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
    workItems: workItems
      .map((w) => ({
        itemId: trimmed(w?.itemId),
        name: trimmed(w?.name),
        unit: trimmed(w?.unit),
        volume: parseReportVolume(w?.volume),
      }))
      .filter((w) => w.itemId),
    ppe: trimmed(body.ppe),
    nextDay: trimmed(body.nextDay),
    problems: trimmed(body.problems),
  }
  const error = validateReportDraft(draft)
  if (error) badRequest(error)
  return draft
}

/**
 * One row per daily report in `daily_reports`. Migrates once from the legacy JSON snapshot
 * `reports` so older databases keep working without rewriting the whole file on each save.
 */
function migrateFromSnapshot(db: Database, storage: Storage): void {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM daily_reports').get() as { n: number }).n
  if (count > 0) return
  const legacy = storage.snapshot<DailyReport[]>('reports', { empty: () => [] })
  if (!legacy.state.length) return
  const insert = db.prepare(
    'INSERT OR REPLACE INTO daily_reports (id, object_id, date, payload, updated_at) VALUES (?, ?, ?, ?, ?)',
  )
  db.exec('BEGIN')
  try {
    for (const report of legacy.state) {
      insert.run(report.id, report.objectId, report.date, JSON.stringify(report), report.updatedAt)
    }
    // Keep an empty snapshot so older code paths / size metrics do not show a huge blob.
    legacy.save([])
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function createReportsRepository(contracts: ContractsRepository, storage: Storage) {
  const db = storage.db
  migrateFromSnapshot(db, storage)

  const selectAll = db.prepare('SELECT payload FROM daily_reports ORDER BY date DESC')
  const selectByObject = db.prepare('SELECT payload FROM daily_reports WHERE object_id = ? ORDER BY date DESC')
  const selectOne = db.prepare('SELECT payload FROM daily_reports WHERE object_id = ? AND date = ?')
  const selectExists = db.prepare('SELECT 1 AS ok FROM daily_reports WHERE object_id = ? LIMIT 1')
  const selectDates = db.prepare('SELECT date FROM daily_reports WHERE object_id = ? ORDER BY date DESC')
  const upsert = db.prepare(
    `INSERT INTO daily_reports (id, object_id, date, payload, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(object_id, date) DO UPDATE SET
       id = excluded.id,
       payload = excluded.payload,
       updated_at = excluded.updated_at`,
  )

  function parsePayload(payload: string): DailyReport {
    return JSON.parse(payload) as DailyReport
  }

  const repository = {
    hasReports(objectId: string): boolean {
      return Boolean(selectExists.get(objectId))
    },

    list(objectId?: string): DailyReport[] {
      const rows = (
        objectId ? selectByObject.all(objectId) : selectAll.all()
      ) as { payload: string }[]
      return rows.map((r) => parsePayload(r.payload)).sort(byDateDesc)
    },

    dates(objectId: string): string[] {
      return (selectDates.all(objectId) as { date: string }[]).map((r) => r.date)
    },

    get(objectId: string, date: string): DailyReport {
      const row = selectOne.get(objectId, date) as { payload: string } | undefined
      if (!row) notFound('Отчёта за эту дату нет')
      return structuredClone(parsePayload(row.payload))
    },

    save(body: Partial<DailyReportDraft>): DailyReport {
      const draft = parseDraft(body)
      const found = contracts.findObject(draft.objectId)
      if (!found) notFound('Объект не найден')
      draft.workItems = draft.workItems.map((item) => {
        const work = found.object.works.find((entry) => entry.id === item.itemId)
        if (!work) badRequest(`Вид работ «${item.name || item.itemId}» не найден на объекте`)
        return { itemId: work.id, name: work.title, unit: work.unit, volume: item.volume }
      })
      const now = nowIso()
      const existingRow = selectOne.get(draft.objectId, draft.date) as { payload: string } | undefined
      const existing = existingRow ? parsePayload(existingRow.payload) : undefined
      const report: DailyReport = {
        ...draft,
        id: existing?.id ?? uid('r'),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        storagePath: reportStoragePath(draft.objectId, draft.date),
      }
      upsert.run(report.id, report.objectId, report.date, JSON.stringify(report), report.updatedAt)
      return structuredClone(report)
    },
  }

  // `save` writes the row itself; persisted still wraps for a uniform mutator contract.
  return persisted(repository, ['save'], () => undefined)
}

export type ReportsRepository = ReturnType<typeof createReportsRepository>
