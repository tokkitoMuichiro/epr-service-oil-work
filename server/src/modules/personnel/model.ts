import type {
  Brigade,
  BrigadeAssignment,
  EmploymentStatus,
  WorkerDocument,
  WorkerPii,
} from '../../shared.js'

export const PERSONNEL_KEY = 'personnel'
export const WORKER_DOCUMENTS_BUCKET = 'worker-documents'

export interface WorkerRecord {
  id: string
  fullName: string
  position: string
  phone: string
  hiredAt: string
  note: string
  employment: EmploymentStatus
  photoUpdatedAt: string | null
  documents: WorkerDocument[]
  pii: WorkerPii
}

export interface PersonnelState {
  workers: WorkerRecord[]
  brigades: Brigade[]
  assignments: BrigadeAssignment[]
}

export function emptyPersonnel(): PersonnelState {
  return { workers: [], brigades: [], assignments: [] }
}
