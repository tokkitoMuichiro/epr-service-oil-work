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
