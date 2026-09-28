export type WorkStatus = 'planned' | 'in_progress' | 'done'

export interface DeadlineEdit {
  id: string
  field: 'plannedStart' | 'plannedEnd' | 'actualStart' | 'actualEnd'
  previousValue: string
  newValue: string
  editedAt: string
  note: string
}

export interface WorkItem {
  id: string
  title: string
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
}

export interface Contract {
  id: string
  name: string
  customer: string
  year: number
  objects: ContractObject[]
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
