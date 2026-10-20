export type WorkStatus = 'planned' | 'in_progress' | 'done'

export type DeadlineField = 'plannedStart' | 'plannedEnd' | 'actualStart' | 'actualEnd'

export const DEADLINE_FIELDS: DeadlineField[] = ['plannedStart', 'plannedEnd', 'actualStart', 'actualEnd']

export const DEADLINE_FIELD_LABEL: Record<DeadlineField, string> = {
  plannedStart: 'План начала',
  plannedEnd: 'План окончания',
  actualStart: 'Факт начала',
  actualEnd: 'Факт окончания',
}

export interface DeadlineEdit {
  id: string
  field: DeadlineField
  previousValue: string
  newValue: string
  editedAt: string
  note: string
}

export const WORK_UNITS = ['м³', 'м²', 'м', 'шт.', 'кол-во'] as const

export type WorkUnit = (typeof WORK_UNITS)[number]

export function isWorkUnit(value: unknown): value is WorkUnit {
  return WORK_UNITS.includes(value as WorkUnit)
}

export interface WorkItem {
  id: string
  title: string
  unit: WorkUnit
  plannedVolume: number
  actualVolume: number
  plannedStart: string
  plannedEnd: string
  actualStart?: string
  actualEnd?: string
  status: WorkStatus
}

export interface ContractObject {
  id: string
  name: string
  location: string
  plannedStart: string
  plannedEnd: string
  actualStart?: string
  actualEnd?: string
  works: WorkItem[]
  deadlineEdits: DeadlineEdit[]
  /** Qualifications every brigade member needs on this object. */
  requiredQualificationIds?: string[]
  archived?: boolean
  /** Linked Bitrix24 task; required to start work and to file daily reports. */
  bitrixTaskId?: string | null
  bitrixTaskTitle?: string | null
}

export interface Contract {
  id: string
  name: string
  customer: string
  year: number
  objects: ContractObject[]
  archived?: boolean
}

export interface ContractDraft {
  name: string
  customer: string
  year: number
}

export interface ObjectDraft {
  name: string
  location: string
  plannedStart: string
  plannedEnd: string
  requiredQualificationIds?: string[]
}

export type ObjectPatch = Partial<
  Pick<
    ContractObject,
    'name' | 'location' | 'plannedStart' | 'plannedEnd' | 'actualStart' | 'actualEnd' | 'requiredQualificationIds'
  >
>

export interface WorkDraft {
  title: string
  unit: WorkUnit
  plannedVolume: number
  actualVolume: number
  plannedStart: string
  plannedEnd: string
  actualStart?: string
  actualEnd?: string
}

export function workStatus(dates: Pick<WorkItem, 'actualStart' | 'actualEnd'>): WorkStatus {
  if (dates.actualEnd) return 'done'
  if (dates.actualStart) return 'in_progress'
  return 'planned'
}

export type ObjectStatus = WorkStatus

export const OBJECT_STATUSES: ObjectStatus[] = ['planned', 'in_progress', 'done']

export const OBJECT_STATUS_LABEL: Record<ObjectStatus, string> = {
  planned: 'Запланирован',
  in_progress: 'В работе',
  done: 'Завершён',
}

/** Forward along the lifecycle, or one step back to fix a mistaken change. */
export const OBJECT_STATUS_MOVES: Record<ObjectStatus, readonly ObjectStatus[]> = {
  planned: ['in_progress'],
  in_progress: ['done', 'planned'],
  done: ['in_progress'],
}

/** How to attach a Bitrix24 task when starting work on an object. */
export type BitrixTaskBinding =
  | { mode: 'create'; title?: string }
  | { mode: 'link'; taskRef: string }

export interface ObjectStatusChange {
  status: ObjectStatus
  /** Day the work started or finished; ignored when the change is rolled back. */
  date?: string
  note?: string
  /** Required when moving planned → in_progress without an existing `bitrixTaskId`. */
  bitrixTask?: BitrixTaskBinding
}

type ActualDates = Pick<ContractObject, 'actualStart' | 'actualEnd'>

export function objectStatus(object: ActualDates): ObjectStatus {
  return workStatus(object)
}

/** A finished object leaves the active schedule; manual archiving covers cancelled ones. */
export function isObjectArchived(
  contract: Pick<Contract, 'archived'>,
  object: ActualDates & Pick<ContractObject, 'archived'>,
): boolean {
  return Boolean(contract.archived || object.archived || object.actualEnd)
}

export function isRollback(from: ObjectStatus, to: ObjectStatus): boolean {
  return OBJECT_STATUSES.indexOf(to) < OBJECT_STATUSES.indexOf(from)
}

export function validateObjectStatusChange(
  object: ActualDates,
  change: ObjectStatusChange,
  today: string,
): string | null {
  const from = objectStatus(object)
  if (!OBJECT_STATUS_MOVES[from].includes(change.status)) {
    return `Нельзя перевести объект из «${OBJECT_STATUS_LABEL[from]}» в «${OBJECT_STATUS_LABEL[change.status]}»`
  }
  if (isRollback(from, change.status)) return null
  if (!change.date) return change.status === 'done' ? 'Укажите дату завершения' : 'Укажите дату начала работ'
  if (change.date > today) return 'Дата не может быть в будущем'
  if (change.status === 'done' && object.actualStart && change.date < object.actualStart) {
    return 'Дата завершения раньше начала работ'
  }
  return null
}

/** Actual dates after a validated change; `undefined` means the date is cleared. */
export function nextActualDates(object: ActualDates, change: ObjectStatusChange): ActualDates {
  if (change.status === 'planned') return { actualStart: undefined, actualEnd: undefined }
  if (change.status === 'done') return { actualStart: object.actualStart, actualEnd: change.date }
  if (objectStatus(object) === 'done') return { actualStart: object.actualStart, actualEnd: undefined }
  return { actualStart: change.date, actualEnd: undefined }
}

export interface ContractProgress {
  total: number
  planned: number
  inProgress: number
  done: number
  status: ObjectStatus | 'empty'
}

export function contractProgress(contract: Pick<Contract, 'objects'>): ContractProgress {
  const counts = { planned: 0, in_progress: 0, done: 0 }
  for (const object of contract.objects) counts[objectStatus(object)] += 1
  const total = contract.objects.length
  let status: ContractProgress['status'] = 'empty'
  if (total && counts.done === total) status = 'done'
  else if (counts.in_progress || counts.done) status = 'in_progress'
  else if (total) status = 'planned'
  return { total, planned: counts.planned, inProgress: counts.in_progress, done: counts.done, status }
}

export function validateWorkDraft(draft: WorkDraft): string | null {
  if (!draft.title.trim()) return 'Укажите наименование работы'
  if (!isWorkUnit(draft.unit)) return 'Выберите единицу измерения'
  if (!Number.isFinite(draft.plannedVolume) || draft.plannedVolume <= 0) {
    return 'Плановый объём должен быть больше нуля'
  }
  if (!Number.isFinite(draft.actualVolume) || draft.actualVolume < 0) {
    return 'Фактический объём не может быть отрицательным'
  }
  if (draft.actualEnd && !draft.actualStart) return 'Укажите факт начала'
  return validateObjectDates(draft)
}

export type ScheduleVariance = 'on_track' | 'delayed' | 'early' | 'unknown'

export function scheduleVariance(
  plannedEnd: string,
  actualEnd?: string,
  today = new Date().toISOString().slice(0, 10),
): ScheduleVariance {
  if (actualEnd) {
    if (actualEnd < plannedEnd) return 'early'
    if (actualEnd > plannedEnd) return 'delayed'
    return 'on_track'
  }
  if (today > plannedEnd) return 'delayed'
  return 'on_track'
}

export function validateContractDraft(draft: Partial<ContractDraft>): string | null {
  if (!draft.name?.trim()) return 'Укажите название договора'
  if (!draft.customer?.trim()) return 'Укажите заказчика'
  if (!Number.isInteger(draft.year) || (draft.year ?? 0) < 2000 || (draft.year ?? 0) > 2100) {
    return 'Укажите корректный год'
  }
  return null
}

/** Assigning outside the object's planned dates is allowed, but the planner must be warned. */
export function isOutsidePlan(
  object: Pick<ContractObject, 'plannedStart' | 'plannedEnd'>,
  period: { from: string; to: string },
): boolean {
  if (!object.plannedStart || !object.plannedEnd) return false
  return period.from < object.plannedStart || period.to > object.plannedEnd
}

export function validateObjectDates(object: Pick<ContractObject, 'plannedStart' | 'plannedEnd' | 'actualStart' | 'actualEnd'>): string | null {
  if (!object.plannedStart || !object.plannedEnd) return 'Укажите плановые сроки'
  if (object.plannedEnd < object.plannedStart) return 'План окончания раньше плана начала'
  if (object.actualStart && object.actualEnd && object.actualEnd < object.actualStart) {
    return 'Факт окончания раньше факта начала'
  }
  return null
}
