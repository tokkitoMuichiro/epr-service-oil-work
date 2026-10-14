import { cellRef, type ExcelCell, type ExcelFont, type ExcelSheet, type ExcelStyle } from '../../excel.js'
import {
  addDaysIso,
  formatIsoDate,
  objectSpan,
  periodContaining,
  plannedVolumeOn,
  type Contract,
  type ContractObject,
  type DailyReport,
  type DateSpan,
} from '../../shared.js'

/** Layout of the customer's «Прил.2 ГПР» (monthly-daily work schedule) form. */

export const GPR_FONT: ExcelFont = { name: 'Franklin Gothic Book', size: 12 }

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

const PLAN_FILL = '#FF0000'
const FACT_FILL = '#92D050'
const COLLAPSED_FILL = '#B4C6E7'
const TODAY_FILL = '#FFE699'

const BASE_STYLES: ExcelStyle[] = [
  { id: 'gpr_approve', size: 16, align: 'Left', wrap: true },
  { id: 'gpr_title', size: 14, bold: true, align: 'Center', wrap: true },
  { id: 'gpr_subtitle', align: 'Center', wrap: true },
  { id: 'gpr_head', border: true, align: 'Center', wrap: true },
  { id: 'gpr_month', border: true, align: 'Center', bold: true, shrink: true },
  { id: 'gpr_day', border: true, align: 'Center', size: 10 },
  { id: 'gpr_today', border: true, align: 'Center', size: 10, bold: true, fill: TODAY_FILL },
  { id: 'gpr_collapsed', border: true, align: 'Center', size: 10, fill: COLLAPSED_FILL },
  { id: 'gpr_index', border: true, align: 'Center', size: 9 },
  { id: 'gpr_center', border: true, align: 'Center', wrap: true },
  { id: 'gpr_name', border: true, align: 'Left', wrap: true },
  { id: 'gpr_object', border: true, align: 'Left', wrap: true, bold: true },
  { id: 'gpr_num', border: true, align: 'Center', shrink: true },
  { id: 'gpr_cell', border: true },
  { id: 'gpr_plan', border: true, fill: PLAN_FILL },
  { id: 'gpr_fact', border: true, fill: FACT_FILL, align: 'Center', size: 9, shrink: true },
  { id: 'gpr_legend', align: 'Left' },
]

export const GPR_STYLES: ExcelStyle[] = BASE_STYLES.map((style) => (style.border ? { ...style, borderColor: '#000000' } : style))

export interface GprColumn {
  from: string
  to: string
  /** A whole month folded into one column. */
  isCollapsed: boolean
}

export interface GprMonth {
  label: string
  columns: GprColumn[]
}

function monthIndex(iso: string): number {
  return Number(iso.slice(5, 7)) - 1
}

function dayOf(iso: string): number {
  return Number(iso.slice(8, 10))
}

function minIso(a: string, b: string): string {
  return a < b ? a : b
}

function maxIso(a: string, b: string): string {
  return a > b ? a : b
}

/** Months of the span: the `focus` month and the next one by days, every other month folded into a single column. */
export function gprTimeline(span: DateSpan, focus: string): GprMonth[] {
  const focusMonth = periodContaining('month', focus)
  const nextMonth = addDaysIso(focusMonth.end, 1)
  const months: GprMonth[] = []
  for (let start = periodContaining('month', span.from).start; start <= span.to; ) {
    const end = periodContaining('month', start).end
    const from = maxIso(start, span.from)
    const to = minIso(end, span.to)
    const columns: GprColumn[] = []
    if (start < focusMonth.start || start > nextMonth) columns.push({ from, to, isCollapsed: true })
    else for (let day = from; day <= to; day = addDaysIso(day, 1)) columns.push({ from: day, to: day, isCollapsed: false })
    months.push({ label: `${MONTHS[monthIndex(start)]} ${start.slice(0, 4)}`, columns })
    start = addDaysIso(end, 1)
  }
  return months
}

/** `"13" октября 2026 г.` */
export function approvalDate(iso: string): string {
  return `"${iso.slice(8, 10)}" ${MONTHS_GENITIVE[monthIndex(iso)]} ${iso.slice(0, 4)} г.`
}

function gprSpan(object: ContractObject, reportDates: string[], today: string): DateSpan | null {
  const dates = [objectSpan(object)?.from, objectSpan(object)?.to, ...reportDates].filter((d): d is string => Boolean(d)).sort()
  if (!dates.length) return null
  const span = { from: dates[0], to: dates[dates.length - 1] }
  if (!object.actualEnd && today > span.to && today >= span.from) span.to = today
  return span
}

function volume(value: number): number {
  return Math.round(value * 100) / 100
}

function lineCount(text: string, widthPoints: number, fontSize: number): number {
  const perLine = Math.max(1, Math.floor(widthPoints / (fontSize * 0.55)))
  return Math.max(1, Math.ceil(text.length / perLine))
}

const COLUMN_WIDTHS = [48, 300, 62, 78, 72, 72, 66]
const DAY_WIDTH = 26
const COLLAPSED_WIDTH = 40
const FIRST_DAY_COLUMN = COLUMN_WIDTHS.length
const HEAD_ROW = 7
const BODY_ROW = 10

export interface GprInput {
  name: string
  contract: Contract
  object: ContractObject
  reports: DailyReport[]
  today: string
}

export function gprSheet({ name, contract, object, reports, today }: GprInput): ExcelSheet {
  const own = reports.filter((r) => r.objectId === object.id)
  const reportDates = own.map((r) => r.date)
  const span = gprSpan(object, reportDates, today)
  const months = span ? gprTimeline(span, minIso(maxIso(today, span.from), span.to)) : []
  const timeline = months.flatMap((m) => m.columns)
  const lastColumn = Math.max(FIRST_DAY_COLUMN + timeline.length - 1, FIRST_DAY_COLUMN - 1)
  const widths = [...COLUMN_WIDTHS, ...timeline.map((c) => (c.isCollapsed ? COLLAPSED_WIDTH : DAY_WIDTH))]

  const rows: ExcelCell[][] = []
  const merges: string[] = []
  const heights: Record<number, number> = {}

  function put(row: number, column: number, value: string | number, style: string) {
    ;(rows[row - 1] ??= [])[column] = { value, style }
  }

  function area(row: number, column: number, toRow: number, toColumn: number, value: string | number, style: string) {
    for (let r = row; r <= toRow; r++) for (let c = column; c <= toColumn; c++) put(r, c, r === row && c === column ? value : '', style)
    if (toRow > row || toColumn > column) merges.push(`${cellRef(column, row)}:${cellRef(toColumn, toRow)}`)
  }

  let approveFrom = lastColumn
  for (let width = widths[lastColumn]; approveFrom > 2 && width < 300; ) width += widths[--approveFrom]
  area(1, approveFrom, 1, lastColumn, 'Утверждаю:', 'gpr_approve')
  area(2, approveFrom, 2, lastColumn, 'Генеральный директор ООО "АММИР"', 'gpr_approve')
  area(3, approveFrom, 3, lastColumn, approvalDate(today), 'gpr_approve')
  for (const row of [1, 2, 3]) heights[row] = 22

  const titleWidth = COLUMN_WIDTHS.reduce((sum, w) => sum + w, 0)
  const title = `Месячно-суточный график выполнения работ по объекту: «${[object.name, object.location, contract.customer]
    .filter(Boolean)
    .join(', ')}»`
  area(4, 0, 5, FIRST_DAY_COLUMN - 1, title, 'gpr_title')
  heights[4] = heights[5] = Math.max(20, Math.ceil((lineCount(title, titleWidth, 14) * 19) / 2))
  area(6, 0, 6, FIRST_DAY_COLUMN - 1, `Договор: ${contract.name}`, 'gpr_subtitle')

  area(HEAD_ROW, 0, HEAD_ROW + 1, 0, '№ п/п', 'gpr_head')
  area(HEAD_ROW, 1, HEAD_ROW + 1, 1, 'Наименование работ', 'gpr_head')
  area(HEAD_ROW, 2, HEAD_ROW + 1, 2, 'Ед. изм.', 'gpr_head')
  area(HEAD_ROW, 3, HEAD_ROW + 1, 3, 'Количество', 'gpr_head')
  area(HEAD_ROW, 4, HEAD_ROW, 5, `Выполнено на ${formatIsoDate(today)}`, 'gpr_head')
  put(HEAD_ROW + 1, 4, 'план', 'gpr_head')
  put(HEAD_ROW + 1, 5, 'факт', 'gpr_head')
  put(HEAD_ROW, 6, 'месяц', 'gpr_head')
  put(HEAD_ROW + 1, 6, 'дни месяца', 'gpr_head')
  let column = FIRST_DAY_COLUMN
  for (const month of months) {
    const isShort = month.columns.length < 3
    area(HEAD_ROW, column, HEAD_ROW, column + month.columns.length - 1, isShort ? month.label.split(' ')[0] : month.label, 'gpr_month')
    for (const c of month.columns) {
      if (c.isCollapsed) put(HEAD_ROW + 1, column, c.from === c.to ? dayOf(c.from) : `${dayOf(c.from)}-${dayOf(c.to)}`, 'gpr_collapsed')
      else put(HEAD_ROW + 1, column, dayOf(c.from), c.from === today ? 'gpr_today' : 'gpr_day')
      column++
    }
  }
  for (let c = 0; c <= lastColumn; c++) put(HEAD_ROW + 2, c, c + 1, 'gpr_index')
  heights[HEAD_ROW] = 34
  heights[HEAD_ROW + 1] = 30

  function timelineRows(row: number, isPlanned: (c: GprColumn) => boolean, fact: (c: GprColumn) => number | string | null) {
    put(row, 6, 'план', 'gpr_center')
    put(row + 1, 6, 'факт', 'gpr_center')
    timeline.forEach((c, i) => {
      put(row, FIRST_DAY_COLUMN + i, '', isPlanned(c) ? 'gpr_plan' : 'gpr_cell')
      const value = fact(c)
      put(row + 1, FIRST_DAY_COLUMN + i, value ?? '', value === null ? 'gpr_cell' : 'gpr_fact')
    })
  }

  function overlapsPlan(c: GprColumn, plan: { plannedStart: string; plannedEnd: string }): boolean {
    return Boolean(plan.plannedStart && plan.plannedEnd) && c.from <= plan.plannedEnd && plan.plannedStart <= c.to
  }

  let row = BODY_ROW
  area(row, 0, row + 1, 0, '', 'gpr_center')
  area(row, 1, row + 1, 1, 'Сроки объекта (факт — дни с ежедневным отчётом)', 'gpr_object')
  for (const c of [2, 3, 4, 5]) area(row, c, row + 1, c, '', 'gpr_num')
  timelineRows(
    row,
    (c) => overlapsPlan(c, object),
    (c) => (reportDates.some((d) => d >= c.from && d <= c.to) ? '' : null),
  )
  heights[row] = heights[row + 1] = 20
  row += 2

  object.works.forEach((work, index) => {
    const items = own.flatMap((r) => r.workItems.filter((w) => w.itemId === work.id).map((w) => ({ date: r.date, volume: w.volume })))
    area(row, 0, row + 1, 0, index + 1, 'gpr_center')
    area(row, 1, row + 1, 1, work.title, 'gpr_name')
    area(row, 2, row + 1, 2, work.unit, 'gpr_center')
    area(row, 3, row + 1, 3, work.plannedVolume, 'gpr_num')
    area(row, 4, row + 1, 4, volume(plannedVolumeOn(work, today)), 'gpr_num')
    area(row, 5, row + 1, 5, volume(work.actualVolume), 'gpr_num')
    timelineRows(
      row,
      (c) => overlapsPlan(c, work),
      (c) => {
        const inColumn = items.filter((i) => i.date >= c.from && i.date <= c.to)
        if (!inColumn.length) return null
        return volume(inColumn.reduce((sum, i) => sum + (Number(i.volume) || 0), 0)) || ''
      },
    )
    heights[row] = heights[row + 1] = Math.max(20, Math.ceil((lineCount(work.title, COLUMN_WIDTHS[1], GPR_FONT.size) * 17 + 4) / 2))
    row += 2
  })

  row += 1
  put(row++, 1, 'Обозначения:', 'gpr_legend')
  const legend: [string, string][] = [
    ['gpr_plan', 'план — дни работ по графику'],
    ['gpr_fact', 'факт — день с ежедневным отчётом, число — объём за день'],
    ['gpr_collapsed', 'месяцы, кроме текущего и следующего, свёрнуты в одну колонку'],
    ['gpr_today', 'сегодня'],
  ]
  for (const [style, text] of legend) {
    put(row, 0, '', style)
    put(row++, 1, text, 'gpr_legend')
  }

  return {
    name,
    columns: widths,
    rows: Array.from(rows, (r) => r ?? []),
    merges,
    heights,
    freeze: { rows: HEAD_ROW + 2, columns: FIRST_DAY_COLUMN },
    zoom: 70,
    print: { paper: 'A3', landscape: true, fitWidth: true, centered: true, titleRows: [HEAD_ROW, HEAD_ROW + 2] },
  }
}
