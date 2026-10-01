const monthsRu = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
]

const monthsFullRu = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

const weekdaysRu = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDateRu(iso?: string): string {
  if (!iso) return '—'
  const d = parseIsoDate(iso)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

export function formatDateTimeRu(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatMonthLabel(iso: string): string {
  const d = parseIsoDate(iso)
  return `${monthsRu[d.getMonth()]} ${d.getFullYear()}`
}

export function formatDayMonth(iso: string): string {
  const d = parseIsoDate(iso)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function formatShortRange(from?: string, to?: string): string {
  if (!from) return '—'
  const end = to ? formatDateRu(to).replace(/\d{2}(\d{2})$/, '$1') : '…'
  return `${formatDayMonth(from)}.${from.slice(2, 4)} – ${end}`
}

export function monthFullName(iso: string): string {
  return monthsFullRu[parseIsoDate(iso).getMonth()]
}

export function monthShortName(iso: string): string {
  return monthsRu[parseIsoDate(iso).getMonth()]
}

export function weekdayShort(iso: string): string {
  return weekdaysRu[parseIsoDate(iso).getDay()]
}

export function isWeekend(iso: string): boolean {
  const day = parseIsoDate(iso).getDay()
  return day === 0 || day === 6
}

export function daysBetween(a: string, b: string): number {
  const ms = parseIsoDate(b).getTime() - parseIsoDate(a).getTime()
  return Math.round(ms / 86_400_000)
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function minIso(dates: string[]): string {
  return dates.reduce((a, b) => (a < b ? a : b))
}

export function maxIso(dates: string[]): string {
  return dates.reduce((a, b) => (a > b ? a : b))
}
