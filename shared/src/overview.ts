import { isObjectArchived, type Contract, type WorkItem } from './contracts.js'
import { addDaysIso } from './dates.js'
import { authFor, canConfirmFill, isIncomingFor, ownsItem, type EquipmentState } from './equipment.js'
import { trainingDocState, type Worker } from './personnel.js'
import type { ReportDay } from './reports.js'
import { plannedVolumeOn, progressState, type DateSpan, type ProgressState } from './schedule.js'
import type { TrainingCounters } from './training.js'

/** Objects lagging by at least this many percentage points of volume count as behind schedule. */
export const OVERVIEW_LAG_POINTS = 10
export const OVERVIEW_WINDOW_DAYS = 14

export interface VolumeProgress {
  /** Percent of volume that should be done by today, 0–100. */
  expected: number
  /** Percent actually done, 0–100. */
  actual: number
}

export interface OverviewObject {
  contractId: string
  contractName: string
  objectId: string
  name: string
  location: string
  plannedStart: string
  plannedEnd: string
  actualStart?: string
  actualEnd?: string
  state: ProgressState
  progress: VolumeProgress | null
  lastReport: string | null
  /** Report days inside the overview window. */
  reportDays: string[]
}

export type OverviewEventKind = 'start' | 'finish'

export interface OverviewEvent {
  date: string
  kind: OverviewEventKind
  object: OverviewObject
}

export interface OverviewEquipment {
  incoming: number
  needsRepair: number
  needsFix: number
  pendingReview: number
}

export interface DocumentAlert {
  workerId: string
  fullName: string
  state: 'expiring' | 'expired'
  expiresAt: string
}

export interface OverviewDocuments {
  expired: number
  expiring: number
  alerts: DocumentAlert[]
}

/** Each block is `null` when the role cannot see the module. */
export interface Overview {
  today: string
  window: DateSpan
  objects: OverviewObject[] | null
  equipment: OverviewEquipment | null
  documents: OverviewDocuments | null
  training: TrainingCounters | null
}

type MeasurableWork = Pick<WorkItem, 'id' | 'plannedStart' | 'plannedEnd' | 'plannedVolume' | 'actualVolume'>

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Works have different units, so each one weighs the same.
 * Fact is the larger of the volume entered on the work and the total from daily reports.
 */
export function volumeProgress(works: MeasurableWork[], reported: Record<string, number>, today: string): VolumeProgress | null {
  const measurable = works.filter((w) => w.plannedVolume > 0 && w.plannedStart && w.plannedEnd)
  if (!measurable.length) return null
  const expected = mean(measurable.map((w) => plannedVolumeOn(w, today) / w.plannedVolume))
  const actual = mean(
    measurable.map((w) => Math.min(Math.max(w.actualVolume, reported[w.id] ?? 0) / w.plannedVolume, 1)),
  )
  return { expected: Math.round(expected * 100), actual: Math.round(actual * 100) }
}

export function overviewWindow(today: string): DateSpan {
  return { from: addDaysIso(today, -OVERVIEW_WINDOW_DAYS), to: addDaysIso(today, OVERVIEW_WINDOW_DAYS) }
}

/** Active (not archived, not finished) objects with planned dates. */
export function overviewObjects(contracts: Contract[], reportDays: ReportDay[], today: string): OverviewObject[] {
  const window = overviewWindow(today)
  return contracts.flatMap((contract) =>
    contract.objects
      .filter((object) => !isObjectArchived(contract, object) && object.plannedStart && object.plannedEnd)
      .map((object) => {
        const days = reportDays.filter((d) => d.objectId === object.id && d.date <= today)
        const reported: Record<string, number> = {}
        for (const day of days) {
          for (const [workId, volume] of Object.entries(day.volumes)) reported[workId] = (reported[workId] ?? 0) + volume
        }
        const dates = days.map((d) => d.date).sort()
        return {
          contractId: contract.id,
          contractName: contract.name,
          objectId: object.id,
          name: object.name,
          location: object.location,
          plannedStart: object.plannedStart,
          plannedEnd: object.plannedEnd,
          ...(object.actualStart ? { actualStart: object.actualStart } : {}),
          ...(object.actualEnd ? { actualEnd: object.actualEnd } : {}),
          state: progressState(object, today),
          progress: volumeProgress(object.works, reported, today),
          lastReport: dates.length ? dates[dates.length - 1] : null,
          reportDays: dates.filter((d) => d >= window.from),
        }
      }),
  )
}

export function volumeLag(object: Pick<OverviewObject, 'progress'>): number {
  return object.progress ? Math.max(object.progress.expected - object.progress.actual, 0) : 0
}

export function isLagging(object: Pick<OverviewObject, 'state' | 'progress'>): boolean {
  return object.state === 'late_start' || object.state === 'overdue' || volumeLag(object) >= OVERVIEW_LAG_POINTS
}

const LAG_RANK: Partial<Record<ProgressState, number>> = { overdue: 0, late_start: 1 }

export function laggingObjects(objects: OverviewObject[]): OverviewObject[] {
  return objects
    .filter(isLagging)
    .sort((a, b) => (LAG_RANK[a.state] ?? 2) - (LAG_RANK[b.state] ?? 2) || volumeLag(b) - volumeLag(a))
}

export function isInWork(object: Pick<OverviewObject, 'actualStart' | 'actualEnd'>): boolean {
  return Boolean(object.actualStart && !object.actualEnd)
}

/** Objects in work since before yesterday without a report for yesterday or today; oldest report first. */
export function missingReports(objects: OverviewObject[], today: string): OverviewObject[] {
  const yesterday = addDaysIso(today, -1)
  return objects
    .filter((o) => isInWork(o) && o.actualStart! <= yesterday && (o.lastReport ?? '') < yesterday)
    .sort((a, b) => (a.lastReport ?? '').localeCompare(b.lastReport ?? '') || a.name.localeCompare(b.name, 'ru'))
}

export function upcomingEvents(objects: OverviewObject[], today: string, days = OVERVIEW_WINDOW_DAYS): OverviewEvent[] {
  const last = addDaysIso(today, days)
  const inRange = (date: string) => date >= today && date <= last
  return objects
    .flatMap((object): OverviewEvent[] => [
      ...(!object.actualStart && inRange(object.plannedStart) ? [{ date: object.plannedStart, kind: 'start' as const, object }] : []),
      ...(!object.actualEnd && inRange(object.plannedEnd) ? [{ date: object.plannedEnd, kind: 'finish' as const, object }] : []),
    ])
    .sort((a, b) => a.date.localeCompare(b.date) || a.object.name.localeCompare(b.object.name, 'ru'))
}

export function equipmentOverview(state: Pick<EquipmentState, 'persona' | 'permissions' | 'items' | 'transfers'>): OverviewEquipment {
  const auth = authFor(state.persona, state.permissions)
  const count = (test: (item: EquipmentState['items'][number]) => boolean) => state.items.filter(test).length
  return {
    incoming: count((item) => isIncomingFor(auth, item, state.transfers)),
    needsRepair: count((item) => item.condition === 'NEEDS_REPAIR'),
    needsFix: count((item) => item.fillStatus === 'NEEDS_FIX' && ownsItem(auth, item)),
    pendingReview: count((item) => item.fillStatus === 'PENDING_REVIEW' && canConfirmFill(auth, item)),
  }
}

/** The most urgent document per working employee: expired first, then by expiry date. */
export function documentOverview(workers: Pick<Worker, 'id' | 'fullName' | 'employment' | 'documents'>[], today: string, limit = 5): OverviewDocuments {
  const alerts = workers.flatMap((worker): DocumentAlert[] => {
    if (worker.employment === 'fired') return []
    const dated = worker.documents
      .flatMap((d) => (d.expiresAt ? [d.expiresAt] : []))
      .map((expiresAt) => ({ expiresAt, state: trainingDocState(expiresAt, today) }))
      .filter((d) => d.state !== 'valid')
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
    const first = dated[0]
    if (!first || first.state === 'valid') return []
    return [{ workerId: worker.id, fullName: worker.fullName, state: first.state, expiresAt: first.expiresAt }]
  })
  return {
    expired: alerts.filter((a) => a.state === 'expired').length,
    expiring: alerts.filter((a) => a.state === 'expiring').length,
    alerts: alerts.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)).slice(0, limit),
  }
}
