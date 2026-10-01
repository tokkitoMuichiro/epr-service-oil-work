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
