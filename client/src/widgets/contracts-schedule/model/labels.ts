import type { ProgressState, SchedulePeriod } from '@/entities/contract'
import { formatDateRu, formatDayMonth, monthFullName } from '@/shared/lib/date'

export const PROGRESS_LABEL: Record<ProgressState, string> = {
  planned: 'Запланировано',
  late_start: 'Не начато',
  in_progress: 'В работе',
  overdue: 'Отставание',
  done_early: 'Досрочно',
  done_on_time: 'Выполнено',
  done_late: 'С опозданием',
}

export type ProgressTone = 'neutral' | 'active' | 'ok' | 'warn' | 'bad'

export const PROGRESS_TONE: Record<ProgressState, ProgressTone> = {
  planned: 'neutral',
  late_start: 'bad',
  in_progress: 'active',
  overdue: 'bad',
  done_early: 'ok',
  done_on_time: 'ok',
  done_late: 'warn',
}

export const PROGRESS_BADGE: Record<ProgressTone, string> = {
  neutral: 'ui-badge--neutral',
  active: 'ui-badge--info',
  ok: 'ui-badge--ok',
  warn: 'ui-badge--warn',
  bad: 'ui-badge--bad',
}

export function formatPeriodLabel(period: SchedulePeriod): string {
  if (period.scale === 'year') return period.start.slice(0, 4)
  if (period.scale === 'month') return `${monthFullName(period.start)} ${period.start.slice(0, 4)}`
  const sameYear = period.start.slice(0, 4) === period.end.slice(0, 4)
  const from = sameYear ? formatDayMonth(period.start) : formatDateRu(period.start)
  return `${from} – ${formatDateRu(period.end)}`
}

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })

export function formatVolume(value: number): string {
  return numberFormat.format(value)
}

export function volumePercent(actual: number, planned: number): number {
  if (planned <= 0) return 0
  return Math.round((actual / planned) * 100)
}
