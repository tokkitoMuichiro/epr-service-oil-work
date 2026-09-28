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

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDateRu(iso?: string): string {
  if (!iso) return '—'
  const d = parseIsoDate(iso)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

export function formatMonthLabel(iso: string): string {
  const d = parseIsoDate(iso)
  return `${monthsRu[d.getMonth()]} ${d.getFullYear()}`
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
