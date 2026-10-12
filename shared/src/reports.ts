import { isIsoDate } from './dates.js'

/** Ссылка на объект из модуля контрактов (не задача Битрикс). */
export interface ReportObjectRef {
  id: string
  name: string
  location: string
  contractId: string
  contractName: string
  customer: string
}

export interface DronePeriod {
  from: string
  to: string
}

export interface ReportWorkItem {
  itemId: string
  name: string
  unit: string
  volume: number
}

export interface DailyReportDraft {
  objectId: string
  date: string
  authorName: string
  workStartFrom: string
  workStartTo: string
  estimatedCompletion: string
  dronePeriods: DronePeriod[]
  staffItr: string
  staffForemen: string
  staffWorkers: string
  workStage: string
  techMeans: string
  volumes: string
  workItems: ReportWorkItem[]
  ppe: string
  nextDay: string
  problems: string
}

export interface DailyReport extends DailyReportDraft {
  id: string
  createdAt: string
  updatedAt: string
  /** Демо: путь «на Диске» / mock storage */
  storagePath: string
}

export type ReportsMode = 'create' | 'archive'

/** A day with a daily report: the only source of actual progress on the schedule. */
export interface ReportDay {
  objectId: string
  date: string
  /** Contract works mentioned in the report volumes. */
  workIds: string[]
  /** Reported volume per work id for this day. */
  volumes: Record<string, number>
}

export function reportDaysOf(reports: Pick<DailyReport, 'objectId' | 'date' | 'workItems'>[]): ReportDay[] {
  return reports
    .map((r) => {
      const volumes: Record<string, number> = {}
      for (const w of r.workItems) {
        if (w.itemId) volumes[w.itemId] = (volumes[w.itemId] ?? 0) + (Number(w.volume) || 0)
      }
      return { objectId: r.objectId, date: r.date, workIds: Object.keys(volumes), volumes }
    })
    .sort((a, b) => a.objectId.localeCompare(b.objectId) || a.date.localeCompare(b.date))
}

export function reportDatesFor(days: ReportDay[], objectId: string, workId?: string): string[] {
  return reportEntriesFor(days, objectId, workId).map((e) => e.date)
}

export interface ReportEntry {
  date: string
  /** Reported volume of the work; `null` for the whole object. */
  volume: number | null
}

export function reportEntriesFor(days: ReportDay[], objectId: string, workId?: string): ReportEntry[] {
  return days
    .filter((d) => d.objectId === objectId && (!workId || d.workIds.includes(workId)))
    .map((d) => ({ date: d.date, volume: workId ? (d.volumes[workId] ?? 0) : null }))
}

export interface ReportBucket {
  from: string
  to: string
  days: number
  volume: number | null
}

/** Groups report entries into calendar columns (e.g. months of a year view); empty columns are skipped. */
export function bucketReports(entries: ReportEntry[], columns: { start: string; end: string }[]): ReportBucket[] {
  return columns.flatMap((column) => {
    const inside = entries.filter((e) => e.date >= column.start && e.date <= column.end)
    if (!inside.length) return []
    const volumes = inside.map((e) => e.volume)
    const volume = volumes.every((v) => v === null) ? null : volumes.reduce<number>((sum, v) => sum + (v ?? 0), 0)
    return [{ from: column.start, to: column.end, days: inside.length, volume }]
  })
}

export function reportStoragePath(objectId: string, date: string): string {
  return `mock-disk/Ежедневные отчёты/${objectId}/${date}.txt`
}

export function validateReportDraft(draft: Partial<DailyReportDraft>): string | null {
  if (!draft.objectId?.trim()) return 'Выберите объект'
  if (!isIsoDate(draft.date)) return 'Некорректная дата'
  if (!draft.workStartFrom || !draft.workStartTo) return 'Укажите начало работ: с — по'
  if (!draft.estimatedCompletion?.trim()) return 'Укажите предполагаемое завершение работ'
  if (!draft.staffItr?.trim() || !draft.staffForemen?.trim() || !draft.staffWorkers?.trim()) {
    return 'Заполните персонал: ИТР, бригадиры, рабочие'
  }
  if (!draft.workStage?.trim()) return 'Укажите этап работ'
  if (!draft.techMeans?.trim()) return 'Укажите технические средства'
  if (!draft.volumes?.trim()) return 'Укажите выполненные объёмы работ'
  if (!draft.nextDay?.trim()) return 'Укажите работы на следующий день'
  return null
}

export function formatReportPlainText(report: DailyReport, objectTitle: string): string {
  const periods = report.dronePeriods.filter((p) => p.from || p.to)
  const drone =
    periods.length > 0 ? periods.map((p) => `${p.from || '—'}–${p.to || '—'}`).join(', ') : '—'

  const volumesBlock =
    report.workItems.length > 0
      ? [
          ...report.workItems.map((w) => `   • ${w.name} — ${w.volume} ${w.unit}`),
          report.volumes ? `\n${report.volumes}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      : report.volumes || '—'

  return [
    `Ежедневный отчёт — ${objectTitle}`,
    `Дата: ${report.date}`,
    `Составил: ${report.authorName || '—'}`,
    '',
    `1. Начало работ: ${report.workStartFrom} – ${report.workStartTo}`,
    `   Предполагаемое завершение: ${report.estimatedCompletion}`,
    `2. Беспилотная опасность: ${drone}`,
    `3. Персонал: ИТР ${report.staffItr}; бригадиры ${report.staffForemen}; рабочие ${report.staffWorkers}`,
    `4. Этап работ:\n${report.workStage}`,
    `5. Технические средства:\n${report.techMeans}`,
    `6. Выполненные объёмы работ:\n${volumesBlock}`,
    `7. Расход СИЗ:\n${report.ppe || '—'}`,
    `8. Работы на следующий день:\n${report.nextDay}`,
    `9. Возникшие проблемы:\n${report.problems || '—'}`,
  ].join('\n')
}
