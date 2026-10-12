import type { ProgressTone, SchedulePeriod } from '@/entities/contract'
import { formatDateRu, formatDayMonth, monthFullName } from '@/shared/lib/date'

export { PROGRESS_LABEL, PROGRESS_TONE, type ProgressTone } from '@/entities/contract'

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

/** Fits a volume into a narrow day cell: 85 → «85», 12.5 → «12,5», 1450 → «1,5к». */
export function formatCellVolume(value: number): string {
  if (Math.abs(value) >= 1000) return `${numberFormat.format(Math.round(value / 100) / 10)}к`
  return numberFormat.format(Math.round(value * 10) / 10)
}

export function volumePercent(actual: number, planned: number): number {
  if (planned <= 0) return 0
  return Math.round((actual / planned) * 100)
}
