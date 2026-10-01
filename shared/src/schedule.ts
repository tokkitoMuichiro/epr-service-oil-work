import type { Contract, ContractObject } from './contracts.js'
import { addDaysIso, daysBetweenIso } from './dates.js'

export type ScheduleScale = 'week' | 'month' | 'year'

export const SCHEDULE_SCALES: ScheduleScale[] = ['week', 'month', 'year']

export const SCHEDULE_SCALE_LABEL: Record<ScheduleScale, string> = {
  week: 'Неделя',
  month: 'Месяц',
  year: 'Год',
}

export interface DateSpan {
  from: string
  to: string
}

export interface SchedulePeriod {
  scale: ScheduleScale
  start: string
  end: string
}

export interface PeriodColumn {
  start: string
  end: string
}

export interface BarPlacement {
  left: number
  width: number
  clippedStart: boolean
  clippedEnd: boolean
}

function isoFromUtc(y: number, monthIndex: number, d: number): string {
  return new Date(Date.UTC(y, monthIndex, d)).toISOString().slice(0, 10)
}

function splitIso(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number)
  return [y, m - 1, d]
}

export function periodContaining(scale: ScheduleScale, day: string): SchedulePeriod {
  const [y, mi, d] = splitIso(day)
  if (scale === 'week') {
    const offset = (new Date(Date.UTC(y, mi, d)).getUTCDay() + 6) % 7
    const start = addDaysIso(day, -offset)
    return { scale, start, end: addDaysIso(start, 6) }
  }
  if (scale === 'month') {
    return { scale, start: isoFromUtc(y, mi, 1), end: isoFromUtc(y, mi + 1, 0) }
  }
  return { scale, start: isoFromUtc(y, 0, 1), end: isoFromUtc(y, 11, 31) }
}

export function shiftPeriod(period: SchedulePeriod, step: number): SchedulePeriod {
  const [y, mi] = splitIso(period.start)
  if (period.scale === 'week') return periodContaining('week', addDaysIso(period.start, step * 7))
  if (period.scale === 'month') return periodContaining('month', isoFromUtc(y, mi + step, 1))
  return periodContaining('year', isoFromUtc(y + step, 0, 1))
}

export function periodsInRange(scale: ScheduleScale, from: string, to: string): SchedulePeriod[] {
  const result: SchedulePeriod[] = []
  for (let p = periodContaining(scale, from); p.start <= to; p = shiftPeriod(p, 1)) result.push(p)
  return result
}

export function availableScales(from: string, to: string): ScheduleScale[] {
  const days = daysBetweenIso(from, to) + 1
  const scales: ScheduleScale[] = ['week']
  if (days > 31) scales.push('month')
  if (days > 366) scales.push('year')
  return scales
}

export function periodColumns(period: SchedulePeriod): PeriodColumn[] {
  if (period.scale !== 'year') {
    const count = daysBetweenIso(period.start, period.end) + 1
    return Array.from({ length: count }, (_, i) => {
      const day = addDaysIso(period.start, i)
      return { start: day, end: day }
    })
  }
  const [y] = splitIso(period.start)
  return Array.from({ length: 12 }, (_, i) => ({ start: isoFromUtc(y, i, 1), end: isoFromUtc(y, i + 1, 0) }))
}

function periodDays(period: SchedulePeriod): number {
  return daysBetweenIso(period.start, period.end) + 1
}

export function barPlacement(period: SchedulePeriod, from: string, to: string): BarPlacement | null {
  if (to < period.start || from > period.end) return null
  const start = from < period.start ? period.start : from
  const end = to > period.end ? period.end : to
  const total = periodDays(period)
  return {
    left: (daysBetweenIso(period.start, start) / total) * 100,
    width: ((daysBetweenIso(start, end) + 1) / total) * 100,
    clippedStart: from < period.start,
    clippedEnd: to > period.end,
  }
}

export function todayOffset(period: SchedulePeriod, today: string): number | null {
  if (today < period.start || today > period.end) return null
  return ((daysBetweenIso(period.start, today) + 0.5) / periodDays(period)) * 100
}

export function factEnd(actualStart: string, actualEnd: string | undefined, today: string): string {
  if (actualEnd) return actualEnd
  return today > actualStart ? today : actualStart
}

export type ProgressState =
  | 'planned'
  | 'late_start'
  | 'in_progress'
  | 'overdue'
  | 'done_early'
  | 'done_on_time'
  | 'done_late'

export interface ScheduledDates {
  plannedStart: string
  plannedEnd: string
  actualStart?: string
  actualEnd?: string
}

export function progressState(dates: ScheduledDates, today: string): ProgressState {
  if (dates.actualEnd) {
    if (dates.actualEnd < dates.plannedEnd) return 'done_early'
    if (dates.actualEnd > dates.plannedEnd) return 'done_late'
    return 'done_on_time'
  }
  if (dates.actualStart) return today > dates.plannedEnd ? 'overdue' : 'in_progress'
  return today > dates.plannedStart ? 'late_start' : 'planned'
}

export function contractDates(contract: Contract): ScheduledDates | null {
  const objects = contract.objects.filter((o) => o.plannedStart && o.plannedEnd)
  if (!objects.length) return null
  const starts = objects.map((o) => o.plannedStart).sort()
  const ends = objects.map((o) => o.plannedEnd).sort()
  const actualStarts = objects.flatMap((o) => (o.actualStart ? [o.actualStart] : [])).sort()
  const actualEnds = objects.flatMap((o) => (o.actualEnd ? [o.actualEnd] : [])).sort()
  const dates: ScheduledDates = { plannedStart: starts[0], plannedEnd: ends[ends.length - 1] }
  if (actualStarts.length) dates.actualStart = actualStarts[0]
  if (actualEnds.length === objects.length) dates.actualEnd = actualEnds[actualEnds.length - 1]
  return dates
}

function spanOf(dates: (string | undefined)[]): DateSpan | null {
  const list = dates.filter((d): d is string => Boolean(d)).sort()
  return list.length ? { from: list[0], to: list[list.length - 1] } : null
}

function objectDates(object: ContractObject): (string | undefined)[] {
  return [
    object.plannedStart,
    object.plannedEnd,
    object.actualStart,
    object.actualEnd,
    ...object.works.flatMap((w) => [w.plannedStart, w.plannedEnd, w.actualStart, w.actualEnd]),
  ]
}

export function objectSpan(object: ContractObject): DateSpan | null {
  return spanOf(objectDates(object))
}

export function contractSpan(contract: Contract): DateSpan | null {
  return spanOf(contract.objects.flatMap(objectDates))
}

export function scheduleBounds(contracts: Contract[]): DateSpan | null {
  return spanOf(contracts.flatMap((c) => c.objects.flatMap(objectDates)))
}
