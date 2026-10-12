import { workbook, type ExcelCell, type ExcelStyle } from '../../excel.js'
import {
  OBJECT_STATUS_LABEL,
  PROGRESS_LABEL,
  PROGRESS_TONE,
  addDaysIso,
  contractDates,
  formatIsoDate,
  objectSpan,
  objectStatus,
  periodContaining,
  progressState,
  type Contract,
  type ContractObject,
  type DailyReport,
  type DateSpan,
  type ProgressTone,
  type ScheduledDates,
} from '../../shared.js'

/** Fact (report) fills are saturated so they never blend with the light grey plan fill. */
const TONE_FILL: Record<ProgressTone, { fill: string; color?: string }> = {
  neutral: { fill: '#2E75B6', color: '#FFFFFF' },
  active: { fill: '#2E75B6', color: '#FFFFFF' },
  ok: { fill: '#548235', color: '#FFFFFF' },
  warn: { fill: '#FFC000' },
  bad: { fill: '#C00000', color: '#FFFFFF' },
}

const PLAN_FILL = '#DDE1E6'

const STYLES: ExcelStyle[] = [
  { id: 'title', bold: true },
  { id: 'label', color: '#667085' },
  { id: 'head', bold: true, fill: '#EEF1F5', border: true, wrap: true },
  { id: 'headDay', bold: true, fill: '#EEF1F5', border: true, align: 'Center' },
  { id: 'headToday', bold: true, fill: '#FFE699', border: true, align: 'Center' },
  { id: 'group', bold: true, fill: '#F5F7FA', border: true },
  { id: 'text', border: true },
  { id: 'num', border: true, align: 'Right' },
  { id: 'empty', border: true },
  { id: 'plan', border: true, fill: PLAN_FILL },
  ...Object.entries(TONE_FILL).map(([tone, { fill, color }]) => ({
    id: `rep_${tone}`,
    border: true,
    fill,
    color,
    align: 'Center' as const,
    bold: true,
  })),
]

function date(value: string | undefined): string {
  return value ? formatIsoDate(value) : ''
}

function shortDate(value: string): string {
  return formatIsoDate(value).slice(0, 5)
}

function text(value: string | number, style = 'text'): ExcelCell {
  return { value, style }
}

function toneOf(dates: ScheduledDates, today: string): ProgressTone {
  return PROGRESS_TONE[progressState(dates, today)]
}

function spanOf(days: string[]): DateSpan | null {
  const sorted = days.filter(Boolean).sort()
  return sorted.length ? { from: sorted[0], to: sorted[sorted.length - 1] } : null
}

function reportsOf(reports: DailyReport[], objectId: string): DailyReport[] {
  return reports.filter((r) => r.objectId === objectId).sort((a, b) => a.date.localeCompare(b.date))
}

function weekStarts(span: DateSpan): string[] {
  const weeks: string[] = []
  for (let day = periodContaining('week', span.from).start; day <= span.to; day = addDaysIso(day, 7)) weeks.push(day)
  return weeks
}

function daysOf(span: DateSpan): string[] {
  const days: string[] = []
  for (let day = span.from; day <= span.to; day = addDaysIso(day, 1)) days.push(day)
  return days
}

function overlaps(from: string, to: string, plan: ScheduledDates): boolean {
  return Boolean(plan.plannedStart && plan.plannedEnd) && from <= plan.plannedEnd && plan.plannedStart <= to
}

function timelineCell(count: number | string, isPlanned: boolean, tone: ProgressTone): ExcelCell {
  if (count) return { value: count, style: `rep_${tone}` }
  return { value: '', style: isPlanned ? 'plan' : 'empty' }
}

function legendRows(): ExcelCell[][] {
  return [
    [text('Обозначения', 'title')],
    [{ value: '', style: 'plan' }, text('План: период работ по графику', 'label')],
    [{ value: '●', style: 'rep_active' }, text('Факт: день с отчётом, в работе (число — объём или количество отчётов)', 'label')],
    [{ value: '●', style: 'rep_ok' }, text('Факт: выполнено в срок или досрочно', 'label')],
    [{ value: '●', style: 'rep_warn' }, text('Факт: выполнено с опозданием', 'label')],
    [{ value: '●', style: 'rep_bad' }, text('Факт: отставание от плана', 'label')],
    [text('Серая ячейка без отметки — по плану работы шли, но отчёта не было', 'label')],
  ]
}

export interface SummaryExport {
  title: string
  contracts: Contract[]
  reports: DailyReport[]
  today: string
}

const SUMMARY_HEAD = [
  'Договор / объект',
  'Заказчик / площадка',
  'Статус',
  'Ход работ',
  'План начала',
  'План окончания',
  'Факт начала',
  'Факт окончания',
  'Отчётов',
]

export function summaryWorkbook({ title, contracts, reports, today }: SummaryExport): Buffer {
  const objects = contracts.flatMap((c) => c.objects)
  const span = spanOf(
    objects.flatMap((o) => [
      o.plannedStart,
      o.plannedEnd,
      o.actualStart ?? '',
      o.actualEnd ?? '',
      ...reportsOf(reports, o.id).map((r) => r.date),
    ]),
  )
  const weeks = span ? weekStarts(span) : []
  const todayWeek = periodContaining('week', today).start

  function weekCounts(objectIds: string[]): number[] {
    const dates = reports.filter((r) => objectIds.includes(r.objectId)).map((r) => r.date)
    return weeks.map((start) => {
      const end = addDaysIso(start, 6)
      return dates.filter((d) => d >= start && d <= end).length
    })
  }

  const rows: ExcelCell[][] = [
    [text(title, 'title')],
    [text(`Состояние на ${formatIsoDate(today)}`, 'label')],
    [],
    [
      ...SUMMARY_HEAD.map((value) => text(value, 'head')),
      ...weeks.map((start) => text(shortDate(start), start === todayWeek ? 'headToday' : 'headDay')),
    ],
  ]
  const headRow = rows.length

  for (const contract of contracts) {
    const dates = contractDates(contract)
    const counts = weekCounts(contract.objects.map((o) => o.id))
    const tone = dates ? toneOf(dates, today) : 'neutral'
    rows.push([
      text(contract.name, 'group'),
      text(contract.customer, 'group'),
      text(`Объектов: ${contract.objects.length}`, 'group'),
      text(dates ? PROGRESS_LABEL[progressState(dates, today)] : '', 'group'),
      text(date(dates?.plannedStart), 'group'),
      text(date(dates?.plannedEnd), 'group'),
      text(date(dates?.actualStart), 'group'),
      text(date(dates?.actualEnd), 'group'),
      text(counts.reduce((sum, n) => sum + n, 0), 'group'),
      ...weeks.map((start, i) =>
        timelineCell(counts[i], dates ? overlaps(start, addDaysIso(start, 6), dates) : false, tone),
      ),
    ])
    for (const object of contract.objects) {
      const objectCounts = weekCounts([object.id])
      const tone = toneOf(object, today)
      rows.push([
        text(`   ${object.name}`),
        text(object.location),
        text(OBJECT_STATUS_LABEL[objectStatus(object)]),
        text(PROGRESS_LABEL[progressState(object, today)]),
        text(date(object.plannedStart)),
        text(date(object.plannedEnd)),
        text(date(object.actualStart)),
        text(date(object.actualEnd)),
        text(objectCounts.reduce((sum, n) => sum + n, 0), 'num'),
        ...weeks.map((start, i) => timelineCell(objectCounts[i], overlaps(start, addDaysIso(start, 6), object), tone)),
      ])
    }
  }

  return workbook(
    [
      {
        name: 'Сводный график',
        columns: [220, 160, 90, 100, 76, 76, 76, 76, 56, ...weeks.map(() => 34)],
        rows: [...rows, [], ...legendRows()],
        freeze: { rows: headRow, columns: 1 },
      },
    ],
    STYLES,
  )
}

export interface ObjectExport {
  contract: Contract
  object: ContractObject
  reports: DailyReport[]
  today: string
}

const OBJECT_HEAD = [
  'Работа',
  'Ед.',
  'Объём по плану',
  'Выполнено',
  '%',
  'По отчётам',
  'План начала',
  'План окончания',
  'Факт начала',
  'Факт окончания',
  'Статус',
]

function volume(value: number): number {
  return Math.round(value * 1000) / 1000
}

export function objectWorkbook({ contract, object, reports, today }: ObjectExport): Buffer {
  const own = reportsOf(reports, object.id)
  const span = spanOf([
    objectSpan(object)?.from ?? '',
    objectSpan(object)?.to ?? '',
    ...own.map((r) => r.date),
  ])
  const days = span ? daysOf(span) : []
  const reportDates = new Set(own.map((r) => r.date))

  function reportedOn(workId: string, day: string): number {
    return own
      .filter((r) => r.date === day)
      .flatMap((r) => r.workItems)
      .filter((w) => w.itemId === workId)
      .reduce((sum, w) => sum + w.volume, 0)
  }

  function isReported(workId: string, day: string): boolean {
    return own.some((r) => r.date === day && r.workItems.some((w) => w.itemId === workId))
  }

  const objectTone = toneOf(object, today)
  const rows: ExcelCell[][] = [
    [text(`График объекта «${object.name}»`, 'title')],
    [text('Договор', 'label'), text(contract.name)],
    [text('Заказчик', 'label'), text(contract.customer)],
    [text('Площадка', 'label'), text(object.location)],
    [text('Статус', 'label'), text(`${OBJECT_STATUS_LABEL[objectStatus(object)]} · ${PROGRESS_LABEL[progressState(object, today)]}`)],
    [text('План', 'label'), text(`${date(object.plannedStart)} — ${date(object.plannedEnd)}`)],
    [text('Факт', 'label'), text(object.actualStart ? `${date(object.actualStart)} — ${date(object.actualEnd) || 'в работе'}` : 'не начат')],
    [text('Дней с отчётами', 'label'), text(reportDates.size, 'num')],
    [text('Состояние на', 'label'), text(formatIsoDate(today))],
    [],
    [
      ...OBJECT_HEAD.map((value) => text(value, 'head')),
      ...days.map((day) => text(shortDate(day), day === today ? 'headToday' : 'headDay')),
    ],
  ]
  const headRow = rows.length

  rows.push([
    text('Объект целиком', 'group'),
    ...Array.from({ length: 5 }, () => text('', 'group')),
    text(date(object.plannedStart), 'group'),
    text(date(object.plannedEnd), 'group'),
    text(date(object.actualStart), 'group'),
    text(date(object.actualEnd), 'group'),
    text(OBJECT_STATUS_LABEL[objectStatus(object)], 'group'),
    ...days.map((day) => timelineCell(reportDates.has(day) ? '●' : '', overlaps(day, day, object), objectTone)),
  ])

  for (const work of object.works) {
    const reported = volume(own.flatMap((r) => r.workItems).filter((w) => w.itemId === work.id).reduce((s, w) => s + w.volume, 0))
    const tone = toneOf(work, today)
    rows.push([
      text(work.title),
      text(work.unit),
      text(work.plannedVolume, 'num'),
      text(work.actualVolume, 'num'),
      text(work.plannedVolume ? Math.round((work.actualVolume / work.plannedVolume) * 100) : 0, 'num'),
      text(reported, 'num'),
      text(date(work.plannedStart)),
      text(date(work.plannedEnd)),
      text(date(work.actualStart)),
      text(date(work.actualEnd)),
      text(OBJECT_STATUS_LABEL[work.status]),
      ...days.map((day) => {
        const value = isReported(work.id, day) ? volume(reportedOn(work.id, day)) || '●' : ''
        return timelineCell(value, overlaps(day, day, work), tone)
      }),
    ])
  }

  const reportRows: ExcelCell[][] = [
    ['Дата', 'Составил', 'Работа', 'Объём', 'Ед.', 'Этап работ'].map((value) => text(value, 'head')),
    ...own.flatMap((r) => {
      const items = r.workItems.length ? r.workItems : [{ itemId: '', name: '', unit: '', volume: 0 }]
      return items.map((w) => [
        text(formatIsoDate(r.date)),
        text(r.authorName),
        text(w.name),
        w.name ? text(w.volume, 'num') : text(''),
        text(w.unit),
        text(r.workStage),
      ])
    }),
  ]

  return workbook(
    [
      {
        name: 'График',
        columns: [220, 40, 70, 70, 40, 70, 76, 76, 76, 76, 90, ...days.map(() => 34)],
        rows: [...rows, [], ...legendRows()],
        freeze: { rows: headRow, columns: 1 },
      },
      { name: 'Отчёты', columns: [76, 140, 220, 60, 40, 320], rows: reportRows, freeze: { rows: 1, columns: 0 } },
    ],
    STYLES,
  )
}
