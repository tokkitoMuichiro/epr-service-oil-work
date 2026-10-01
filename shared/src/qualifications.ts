import { addMonthsIso, formatIsoDate, isIsoDate } from './dates.js'
import type { Brigade, Worker, WorkerDocument } from './personnel.js'

export type QualificationTypeId =
  | 'labor_safety'
  | 'electrical'
  | 'fire'
  | 'height'
  | 'gas'
  | 'confined'
  | 'first_aid'
  | 'respiratory'
  | 'medical'
  | 'industrial'

export interface QualificationType {
  id: QualificationTypeId
  name: string
  shortName: string
  defaultValidityMonths: number
  /** Critical for hazardous works: blocks assignment when missing or expired. */
  isCritical: boolean
  /** The document carries a group (электробезопасность, работы на высоте). */
  hasGroup: boolean
}

export const QUALIFICATION_TYPES: QualificationType[] = [
  { id: 'labor_safety', name: 'Охрана труда', shortName: 'ОТ', defaultValidityMonths: 36, isCritical: true, hasGroup: false },
  { id: 'electrical', name: 'Электробезопасность', shortName: 'ЭБ', defaultValidityMonths: 12, isCritical: true, hasGroup: true },
  { id: 'fire', name: 'Пожарная безопасность', shortName: 'ПожБ', defaultValidityMonths: 36, isCritical: false, hasGroup: false },
  { id: 'height', name: 'Работы на высоте', shortName: 'Высота', defaultValidityMonths: 36, isCritical: true, hasGroup: true },
  { id: 'gas', name: 'Газоопасные работы', shortName: 'ГОР', defaultValidityMonths: 12, isCritical: true, hasGroup: false },
  { id: 'confined', name: 'Работы в замкнутых пространствах', shortName: 'ЗП', defaultValidityMonths: 12, isCritical: true, hasGroup: false },
  { id: 'first_aid', name: 'Первая помощь', shortName: 'ПП', defaultValidityMonths: 36, isCritical: false, hasGroup: false },
  { id: 'respiratory', name: 'СИЗОД', shortName: 'СИЗОД', defaultValidityMonths: 12, isCritical: true, hasGroup: false },
  { id: 'medical', name: 'Периодический медосмотр', shortName: 'Медосмотр', defaultValidityMonths: 12, isCritical: true, hasGroup: false },
  { id: 'industrial', name: 'Промышленная безопасность', shortName: 'ПБ', defaultValidityMonths: 60, isCritical: false, hasGroup: false },
]

export const OTHER_QUALIFICATION_LABEL = 'Прочее'

/** Default set of qualifications for tank cleaning objects. */
export const TANK_CLEANING_QUALIFICATIONS: QualificationTypeId[] = ['gas', 'confined', 'labor_safety', 'respiratory', 'medical']

export type QualificationSource = Pick<WorkerDocument, 'id' | 'qualificationTypeId' | 'expiresAt'>

export type AssignmentIssueKind = 'missing' | 'expired' | 'expires'

export interface AssignmentIssue {
  workerId: string
  workerName: string
  typeId: QualificationTypeId
  kind: AssignmentIssueKind
  /** Expiry date of the best document; null when there is none. */
  date: string | null
}

const TYPES = new Map(QUALIFICATION_TYPES.map((t) => [t.id, t]))

export function isQualificationTypeId(value: unknown): value is QualificationTypeId {
  return typeof value === 'string' && TYPES.has(value as QualificationTypeId)
}

export function qualificationType(id: string | undefined): QualificationType | null {
  return (id && TYPES.get(id as QualificationTypeId)) || null
}

export function qualificationLabel(id: string | undefined): string {
  return qualificationType(id)?.name ?? OTHER_QUALIFICATION_LABEL
}

export function defaultExpiry(typeId: QualificationTypeId, issuedAt: string): string {
  return addMonthsIso(issuedAt, TYPES.get(typeId)?.defaultValidityMonths ?? 12)
}

/** The document that keeps the qualification valid the longest; a document without expiry never expires. */
export function bestQualificationDocument<T extends QualificationSource>(docs: T[], typeId: QualificationTypeId): T | null {
  const own = docs.filter((d) => d.qualificationTypeId === typeId)
  if (!own.length) return null
  return own.reduce((best, d) => {
    if (!best.expiresAt) return best
    if (!d.expiresAt) return d
    return d.expiresAt > best.expiresAt ? d : best
  })
}

function unique(ids: QualificationTypeId[]): QualificationTypeId[] {
  return QUALIFICATION_TYPES.map((t) => t.id).filter((id) => ids.includes(id))
}

/**
 * Who in the brigade lacks a qualification the object requires on the start date or loses it before the end of the period.
 * Fired workers are skipped: they must not be in a brigade at all.
 */
export function assignmentCompliance(
  brigade: Pick<Brigade, 'memberIds'>,
  workers: Pick<Worker, 'id' | 'fullName' | 'employment' | 'documents'>[],
  objectRequirements: string[],
  period: { from: string; to: string },
): AssignmentIssue[] {
  const byId = new Map(workers.map((w) => [w.id, w]))
  const needed = unique(objectRequirements.filter(isQualificationTypeId))
  if (!needed.length) return []
  return brigade.memberIds.flatMap((id) => {
    const worker = byId.get(id)
    if (!worker || worker.employment === 'fired') return []
    return needed.flatMap((typeId): AssignmentIssue[] => {
      const doc = bestQualificationDocument(worker.documents, typeId)
      const base = { workerId: worker.id, workerName: worker.fullName, typeId }
      if (!doc) return [{ ...base, kind: 'missing', date: null }]
      if (!doc.expiresAt || doc.expiresAt >= period.to) return []
      return [{ ...base, kind: doc.expiresAt < period.from ? 'expired' : 'expires', date: doc.expiresAt }]
    })
  })
}

export function describeAssignmentIssue(issue: AssignmentIssue): string {
  const name = qualificationType(issue.typeId)?.shortName ?? issue.typeId
  const when =
    issue.kind === 'missing'
      ? 'нет документа'
      : issue.kind === 'expired'
        ? `просрочен с ${formatIsoDate(issue.date ?? '')}`
        : `истекает ${formatIsoDate(issue.date ?? '')}`
  return `${issue.workerName} — ${name} — ${when}`
}

export function validateQualificationFields(meta: { qualificationTypeId?: string; group?: string; issuedAt?: string }): string | null {
  if (!meta.qualificationTypeId) return meta.group ? 'Группа указывается только для допуска' : null
  const type = qualificationType(meta.qualificationTypeId)
  if (!type) return 'Неизвестный вид допуска'
  if (meta.group && !type.hasGroup) return `Для допуска «${type.name}» группа не указывается`
  if (meta.issuedAt && !isIsoDate(meta.issuedAt)) return 'Некорректная дата выдачи'
  return null
}
