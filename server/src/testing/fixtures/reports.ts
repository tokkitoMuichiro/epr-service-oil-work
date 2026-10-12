import { addDaysIso, reportStoragePath, type ContractObject, type DailyReport, type ReportWorkItem, type WorkItem } from '../../shared.js'
import { demoContracts } from './contracts.js'

/** The demo dataset is "frozen" on this day: in-progress objects have reports up to it. */
const LAST_REPORT_DAY = '2026-10-10'

interface Crew {
  author: string
  itr: string
  foremen: string
  workers: string
  size: number
}

const CREWS: Record<string, Crew> = {
  north: {
    author: 'Козлов А.В.',
    itr: '2 / Козлов А.В., Ершова О.С.',
    foremen: '2 / Сидоров И.П., Никитин П.С.',
    workers: '4 / бригада «Север»',
    size: 4,
  },
  south: {
    author: 'Морозов Д.О.',
    itr: '1 / Смирнова А.В.',
    foremen: '1 / Морозов Д.О.',
    workers: '4 / бригада «Юг»',
    size: 4,
  },
  east: {
    author: 'Григорьев О.В.',
    itr: '2 / Григорьев О.В., Белова М.О.',
    foremen: '1 / Тарасов В.Г.',
    workers: '4 / бригада «Восток»',
    size: 4,
  },
}

const OBJECT_CREW: Record<string, Crew> = {
  'o-1': CREWS.north,
  'o-4': CREWS.south,
  'o-3': CREWS.south,
  'o-11': CREWS.east,
  'o-12': CREWS.east,
}

const TECH: [RegExp, string][] = [
  [/откачк/i, 'Насос НЦ-80 зав.№4412, илосос КО-505'],
  [/дегазац/i, 'Вентилятор ВВВ-2 зав.№71, газоанализатор АНКАТ'],
  [/зачистк/i, 'Мойка высокого давления зав.№22, шламовый насос'],
  [/дефектоскоп/i, 'УЗК-комплект А1214, вакуумная камера'],
  [/антикорроз/i, 'Пескоструйный аппарат ДСГ-200, окрасочная установка Graco'],
]

const PROBLEMS = [
  'Простой 2 ч — ожидание наряда-допуска от заказчика.',
  'Дождь, работы на открытой площадке остановлены после обеда.',
  'Замена рукава на насосе, простой 1,5 ч.',
  'Задержка поставки материалов заказчиком.',
]

/** Deterministic pseudo-random number in [0, 1) so the seed is identical on every run. */
function random(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10_000) / 10_000
}

function isSunday(day: string): boolean {
  return new Date(`${day}T00:00:00Z`).getUTCDay() === 0
}

function lastDay(object: ContractObject): string {
  return object.actualEnd ?? LAST_REPORT_DAY
}

function workEnd(work: WorkItem, object: ContractObject): string {
  return work.actualEnd ?? lastDay(object)
}

/** Working days with a report: Sundays off and an occasional missed report; start/finish days are always reported. */
function reportDays(object: ContractObject): string[] {
  if (!object.actualStart) return []
  const required = new Set(
    [object.actualStart, object.actualEnd, ...object.works.flatMap((w) => [w.actualStart, w.actualEnd])].filter(
      (d): d is string => Boolean(d),
    ),
  )
  const days: string[] = []
  for (let day = object.actualStart; day <= lastDay(object); day = addDaysIso(day, 1)) {
    const isMissed = isSunday(day) || random(`${object.id}:${day}`) < 0.07
    if (required.has(day) || !isMissed) days.push(day)
  }
  return days
}

function isActive(work: WorkItem, object: ContractObject, day: string): boolean {
  return Boolean(work.actualStart && work.actualStart <= day && day <= workEnd(work, object))
}

/** Splits the completed volume across report days with uneven daily output; the parts add up exactly. */
function dailyVolumes(work: WorkItem, days: string[]): number[] {
  const weights = days.map((day) => 0.5 + random(`${work.id}:${day}`))
  const total = weights.reduce((sum, w) => sum + w, 0)
  let cumulative = 0
  let previous = 0
  return weights.map((w) => {
    cumulative += w
    const rounded = Math.round((work.actualVolume * cumulative) / total)
    const volume = rounded - previous
    previous = rounded
    return volume
  })
}

function techMeans(active: WorkItem[]): string {
  const list = active.flatMap((w) => TECH.filter(([re]) => re.test(w.title)).map(([, text]) => text))
  return [...new Set(list)].join('; ') || 'Ручной инструмент'
}

function report(object: ContractObject, day: string, items: ReportWorkItem[], active: WorkItem[], next: string, crew: Crew): DailyReport {
  const roll = random(`${object.id}:${day}:extra`)
  const startMinute = Math.floor(roll * 4) * 10
  const createdAt = `${day}T${String(13 + Math.floor(roll * 3)).padStart(2, '0')}:${String(Math.floor(roll * 60)).padStart(2, '0')}:00.000Z`
  return {
    id: `r-${object.id}-${day}`,
    objectId: object.id,
    date: day,
    authorName: crew.author,
    workStartFrom: `08:${String(startMinute).padStart(2, '0')}`,
    workStartTo: `08:${String(startMinute + 20).padStart(2, '0')}`,
    estimatedCompletion: object.plannedEnd,
    dronePeriods: roll > 0.85 ? [{ from: '14:00', to: '15:30' }] : [],
    staffItr: crew.itr,
    staffForemen: crew.foremen,
    staffWorkers: crew.workers,
    workStage: active.map((w) => w.title).join(', ') || 'Подготовительные работы',
    techMeans: techMeans(active),
    volumes: items.map((w) => `${w.name} — ${w.volume} ${w.unit}`).join('; ') || 'Подготовительные работы, объёмы не закрывались.',
    workItems: items,
    ppe: `Костюмы защитные — ${crew.size} шт., перчатки — ${crew.size * 2} пар, фильтры СИЗОД — ${crew.size} шт.`,
    nextDay: next,
    problems: roll < 0.12 ? PROBLEMS[Math.floor(roll * 100) % PROBLEMS.length] : '',
    createdAt,
    updatedAt: createdAt,
    storagePath: reportStoragePath(object.id, day),
  }
}

function objectReports(object: ContractObject): DailyReport[] {
  const crew = OBJECT_CREW[object.id]
  const days = reportDays(object)
  if (!crew || !days.length) return []

  const volumes = new Map<string, Map<string, number>>()
  for (const work of object.works) {
    const workDays = days.filter((day) => isActive(work, object, day))
    const parts = dailyVolumes(work, workDays)
    volumes.set(work.id, new Map(workDays.map((day, i) => [day, parts[i]])))
  }

  return days.map((day, index) => {
    const active = object.works.filter((w) => isActive(w, object, day))
    const items = active.flatMap((w) => {
      const volume = volumes.get(w.id)?.get(day) ?? 0
      return volume > 0 ? [{ itemId: w.id, name: w.title, unit: w.unit, volume }] : []
    })
    const nextDay = days[index + 1]
    const upcoming = nextDay ? object.works.filter((w) => isActive(w, object, nextDay)) : []
    const next =
      object.actualEnd === day
        ? 'Сдача объекта заказчику, демобилизация.'
        : upcoming.map((w) => w.title).join(', ') || 'Продолжение работ по графику.'
    return report(object, day, items, active, next, crew)
  })
}

export function demoReports(): DailyReport[] {
  return demoContracts()
    .flatMap((c) => c.objects)
    .flatMap(objectReports)
}
