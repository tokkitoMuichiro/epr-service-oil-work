import { daysBetweenIso, isIsoDate, rangeContains, rangesOverlap } from './dates.js'
export type WorkerStatus = 'working' | 'planned' | 'free'

export const WORKER_STATUS_LABEL: Record<WorkerStatus, string> = {
  working: 'Работает',
  planned: 'Запланирован',
  free: 'Свободен',
}

export type EmploymentStatus = 'active' | 'vacation' | 'fired'

export const EMPLOYMENT_STATUS_LABEL: Record<EmploymentStatus, string> = {
  active: 'Работает',
  vacation: 'В отпуске',
  fired: 'Уволен',
}

export function isEmploymentStatus(value: unknown): value is EmploymentStatus {
  return typeof value === 'string' && value in EMPLOYMENT_STATUS_LABEL
}

export type TrainingDocState = 'valid' | 'expiring' | 'expired'

export const TRAINING_DOC_STATE_LABEL: Record<TrainingDocState, string> = {
  valid: 'Действует',
  expiring: 'Истекает',
  expired: 'Просрочен',
}

export const TRAINING_EXPIRING_DAYS = 30

export const SNILS_MASK = '•••-•••-••• ••'

export interface WorkerPii {
  snils: string
  birthDate: string
  passport: string
}

/** Qualification fields of a training document; documents without a type are shown as «Прочее». */
export interface QualificationFields {
  qualificationTypeId?: string
  number?: string
  issuedAt?: string
  issuer?: string
  group?: string
}

export interface WorkerDocument extends QualificationFields {
  id: string
  title: string
  fileName: string
  mimeType: string
  size: number
  uploadedAt: string
  expiresAt?: string
}

export interface DocumentMeta extends QualificationFields {
  title: string
  fileName: string
  expiresAt?: string
}

export interface Worker {
  id: string
  fullName: string
  position: string
  phone: string
  hiredAt: string
  note: string
  employment: EmploymentStatus
  photoUpdatedAt: string | null
  documents: WorkerDocument[]
  /** null — ПДн скрыты для текущей роли */
  pii: WorkerPii | null
  status: WorkerStatus
  brigadeId: string | null
}

export interface WorkerDraft {
  fullName: string
  position: string
  phone: string
  hiredAt: string
  note: string
  pii?: WorkerPii
}

export interface Brigade {
  id: string
  name: string
  masterIds: string[]
  foremanIds: string[]
  memberIds: string[]
  archived?: boolean
}

export interface BrigadeDraft {
  name: string
  masterIds: string[]
  foremanIds: string[]
  memberIds: string[]
}

export type BrigadeStatus = 'busy' | 'planned' | 'free'

export const BRIGADE_STATUS_LABEL: Record<BrigadeStatus, string> = {
  busy: 'Занята',
  planned: 'Запланирована',
  free: 'Свободна',
}

export interface AssignmentOverride {
  comment: string
  by: string
  at: string
}

export interface BrigadeAssignment {
  id: string
  brigadeId: string
  contractId: string
  objectId: string
  from: string
  to: string
  note: string
  /** Set when the brigade was assigned despite missing or expiring qualifications. */
  override?: AssignmentOverride
}

export interface AssignmentDraft {
  brigadeId: string
  contractId: string
  objectId: string
  from: string
  to: string
  note: string
  /** Justification for assigning a brigade without valid qualifications (needs `brigades_override`). */
  overrideComment?: string
}

export interface CrewMember {
  id: string
  fullName: string
  position: string
  employment: EmploymentStatus
}

export interface ObjectCrew {
  assignment: BrigadeAssignment
  brigadeName: string
  masters: CrewMember[]
  foremen: CrewMember[]
  members: CrewMember[]
}

const SNILS_FORMAT = /^\d{3}-\d{3}-\d{3} \d{2}$/

export function isValidSnils(value: string): boolean {
  return SNILS_FORMAT.test(value)
}

export function trainingDocState(expiresAt: string, today: string): TrainingDocState {
  const left = daysBetweenIso(today, expiresAt)
  if (left < 0) return 'expired'
  if (left <= TRAINING_EXPIRING_DAYS) return 'expiring'
  return 'valid'
}

const STATE_RANK: Record<TrainingDocState, number> = { valid: 0, expiring: 1, expired: 2 }

export function worstTrainingState(docs: WorkerDocument[], today: string): TrainingDocState | null {
  const states = docs.flatMap((d) => (d.expiresAt ? [trainingDocState(d.expiresAt, today)] : []))
  if (!states.length) return null
  return states.reduce((worst, s) => (STATE_RANK[s] > STATE_RANK[worst] ? s : worst))
}

export function workerAttention(
  worker: Pick<Worker, 'employment' | 'documents'>,
  today: string,
): Exclude<TrainingDocState, 'valid'> | null {
  if (worker.employment === 'fired') return null
  const state = worstTrainingState(worker.documents, today)
  return state === 'valid' ? null : state
}

export function workerStatus(
  brigadeId: string | null,
  assignments: BrigadeAssignment[],
  today: string,
): WorkerStatus {
  if (!brigadeId) return 'free'
  const own = assignments.filter((a) => a.brigadeId === brigadeId)
  if (own.some((a) => rangeContains(a.from, a.to, today))) return 'working'
  if (own.some((a) => a.from > today)) return 'planned'
  return 'free'
}

const BRIGADE_STATUS: Record<WorkerStatus, BrigadeStatus> = { working: 'busy', planned: 'planned', free: 'free' }

export function brigadeStatus(brigadeId: string, assignments: BrigadeAssignment[], today: string): BrigadeStatus {
  return BRIGADE_STATUS[workerStatus(brigadeId, assignments, today)]
}

export function brigadeLeaderIds(brigade: Pick<Brigade, 'masterIds' | 'foremanIds'>): string[] {
  return brigade.masterIds.length ? brigade.masterIds : brigade.foremanIds
}

export function brigadeOfWorker(workerId: string, brigades: Brigade[]): Brigade | null {
  return brigades.find((b) => !b.archived && b.memberIds.includes(workerId)) ?? null
}

export function withoutWorker(brigade: Brigade, workerId: string): Brigade {
  const drop = (ids: string[]) => ids.filter((id) => id !== workerId)
  return {
    ...brigade,
    memberIds: drop(brigade.memberIds),
    masterIds: drop(brigade.masterIds),
    foremanIds: drop(brigade.foremanIds),
  }
}

/** A worker may be deleted physically only without documents and without assignments of their brigade. */
export function workerHasHistory(
  worker: Pick<Worker, 'id' | 'documents'>,
  brigades: Brigade[],
  assignments: BrigadeAssignment[],
): boolean {
  if (worker.documents.length) return true
  const own = new Set(brigades.filter((b) => b.memberIds.includes(worker.id)).map((b) => b.id))
  return assignments.some((a) => own.has(a.brigadeId))
}

export function hasPastAssignments(
  assignments: BrigadeAssignment[],
  match: (a: BrigadeAssignment) => boolean,
  today: string,
): boolean {
  return assignments.some((a) => match(a) && a.from <= today)
}

export function isFutureAssignment(assignment: Pick<BrigadeAssignment, 'from'>, today: string): boolean {
  return assignment.from > today
}

export function validateWorkerDraft(draft: Partial<WorkerDraft>): string | null {
  if (!draft.fullName?.trim()) return 'Укажите ФИО'
  if (!draft.position?.trim()) return 'Укажите должность'
  if (draft.hiredAt && !isIsoDate(draft.hiredAt)) return 'Некорректная дата приёма'
  if (draft.pii) {
    if (draft.pii.snils && !isValidSnils(draft.pii.snils)) return 'СНИЛС в формате 123-456-789 00'
    if (draft.pii.birthDate && !isIsoDate(draft.pii.birthDate)) return 'Некорректная дата рождения'
  }
  return null
}

export function validateDocumentMeta(meta: DocumentMeta): string | null {
  if (!meta.title.trim()) return 'Укажите название документа'
  if (!meta.fileName.trim()) return 'Файл не выбран'
  if (meta.expiresAt && !isIsoDate(meta.expiresAt)) return 'Некорректный срок действия'
  if (meta.issuedAt && !isIsoDate(meta.issuedAt)) return 'Некорректная дата выдачи'
  if (meta.issuedAt && meta.expiresAt && meta.expiresAt < meta.issuedAt) return 'Срок действия раньше даты выдачи'
  return null
}

/** Возвращает id сотрудников, которые уже состоят в другой действующей бригаде. */
export function membershipConflicts(
  memberIds: string[],
  brigades: Brigade[],
  editingId: string | null,
): string[] {
  return memberIds.filter((id) =>
    brigades.some((b) => b.id !== editingId && !b.archived && b.memberIds.includes(id)),
  )
}

export function validateBrigadeDraft(
  draft: Partial<BrigadeDraft>,
  brigades: Brigade[],
  editingId: string | null,
): string | null {
  if (!draft.name?.trim()) return 'Укажите название бригады'
  const members = draft.memberIds ?? []
  if (new Set(members).size !== members.length) return 'Сотрудник указан в составе дважды'
  const masters = draft.masterIds ?? []
  const foremen = draft.foremanIds ?? []
  if (masters.some((id) => !members.includes(id))) return 'Мастер должен входить в состав бригады'
  if (foremen.some((id) => !members.includes(id))) return 'Бригадир должен входить в состав бригады'
  if (masters.some((id) => foremen.includes(id))) {
    return 'Один сотрудник не может быть одновременно мастером и бригадиром'
  }
  if (membershipConflicts(members, brigades, editingId).length) {
    return 'Сотрудник не может состоять в двух бригадах одновременно'
  }
  return null
}

export function assignmentConflict(
  draft: Pick<AssignmentDraft, 'brigadeId' | 'from' | 'to'>,
  assignments: BrigadeAssignment[],
  editingId: string | null = null,
): BrigadeAssignment | null {
  return (
    assignments.find(
      (a) =>
        a.id !== editingId &&
        a.brigadeId === draft.brigadeId &&
        rangesOverlap(a.from, a.to, draft.from, draft.to),
    ) ?? null
  )
}

export function objectConflict(
  draft: Pick<AssignmentDraft, 'brigadeId' | 'objectId' | 'from' | 'to'>,
  assignments: BrigadeAssignment[],
  editingId: string | null = null,
): BrigadeAssignment | null {
  return (
    assignments.find(
      (a) =>
        a.id !== editingId &&
        a.objectId === draft.objectId &&
        a.brigadeId !== draft.brigadeId &&
        rangesOverlap(a.from, a.to, draft.from, draft.to),
    ) ?? null
  )
}

export function validateAssignmentDraft(draft: Partial<AssignmentDraft>): string | null {
  if (!draft.brigadeId) return 'Выберите бригаду'
  if (!draft.objectId || !draft.contractId) return 'Выберите объект'
  if (!isIsoDate(draft.from) || !isIsoDate(draft.to)) return 'Укажите период'
  if ((draft.to as string) < (draft.from as string)) return 'Окончание раньше начала'
  return null
}
