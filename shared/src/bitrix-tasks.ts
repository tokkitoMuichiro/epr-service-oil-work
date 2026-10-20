/** Bitrix24 task status «В работе» / In progress. */
export const BITRIX_TASK_STATUS_IN_PROGRESS = '3'

/** Pulls a numeric task id from a bare id or a Bitrix24 task URL. */
export function parseBitrixTaskRef(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{1,12}$/.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed)
    const fromQuery = url.searchParams.get('ID') || url.searchParams.get('TASK_ID') || url.searchParams.get('task_id')
    if (fromQuery && /^\d{1,12}$/.test(fromQuery)) return fromQuery
    const pathMatch = url.pathname.match(/\/task(?:s)?\/(?:view|view\/)?(\d+)/i) || url.pathname.match(/\/(\d+)\/?$/)
    if (pathMatch?.[1]) return pathMatch[1]
  } catch {
    /* not a URL */
  }
  const loose = trimmed.match(/(?:task[/:]|ID=|№\s*)(\d{1,12})/i) || trimmed.match(/\b(\d{1,12})\b/)
  return loose?.[1] ?? null
}

export function isBitrixTaskInProgress(status: string | number | null | undefined): boolean {
  return String(status ?? '') === BITRIX_TASK_STATUS_IN_PROGRESS
}

/** Plain-text copy of a daily report for the Bitrix24 task comment thread. */
export function formatReportBitrixComment(report: {
  date: string
  authorName: string
  workStartFrom: string
  workStartTo: string
  estimatedCompletion: string
  staffItr: string
  staffForemen: string
  staffWorkers: string
  workStage: string
  techMeans: string
  volumes: string
  workItems: { name: string; unit: string; volume: number }[]
  ppe: string
  nextDay: string
  problems: string
  dronePeriods: { from: string; to: string }[]
}): string {
  const lines: string[] = [
    `Ежедневный отчёт за ${report.date}`,
    `Автор: ${report.authorName || '—'}`,
    `Начало работ: ${report.workStartFrom || '—'}–${report.workStartTo || '—'}`,
    `Ориентир завершения: ${report.estimatedCompletion || '—'}`,
    `ИТР: ${report.staffItr || '—'}; бригадиры: ${report.staffForemen || '—'}; рабочие: ${report.staffWorkers || '—'}`,
    `Этап: ${report.workStage || '—'}`,
    `Техника: ${report.techMeans || '—'}`,
  ]
  if (report.dronePeriods.length) {
    lines.push(`Дрон: ${report.dronePeriods.map((p) => `${p.from}–${p.to}`).join(', ')}`)
  }
  if (report.workItems.length) {
    lines.push('Объёмы:')
    for (const item of report.workItems) {
      lines.push(`  • ${item.name}: ${item.volume} ${item.unit}`)
    }
  } else if (report.volumes) {
    lines.push(`Объёмы: ${report.volumes}`)
  }
  if (report.ppe) lines.push(`СИЗ: ${report.ppe}`)
  if (report.nextDay) lines.push(`На завтра: ${report.nextDay}`)
  if (report.problems) lines.push(`Проблемы: ${report.problems}`)
  return lines.join('\n')
}
