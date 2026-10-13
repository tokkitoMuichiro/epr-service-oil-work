import type {
  Brigade,
  BrigadeAssignment,
  EmploymentStatus,
  WorkerDocument,
  WorkerPii,
} from '../../shared.js'

export const PERSONNEL_KEY = 'personnel'
/** Files uploaded before Bitrix Disk; read from SQLite while they last. */
export const WORKER_DOCUMENTS_BUCKET = 'worker-documents'
/** Local copy of each photo on Disk: avatars are shown in every list. */
export const WORKER_PHOTOS_BUCKET = 'worker-photos'

export interface WorkerDocumentRecord extends WorkerDocument {
  diskFileId?: string
}

export interface WorkerRecord {
  id: string
  fullName: string
  position: string
  phone: string
  hiredAt: string
  note: string
  employment: EmploymentStatus
  photoUpdatedAt: string | null
  photoFileId?: string | null
  documents: WorkerDocumentRecord[]
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
