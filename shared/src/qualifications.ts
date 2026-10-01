import { addMonthsIso, formatIsoDate, isIsoDate } from './dates.js'
import { trainingDocState, type Brigade, type Worker, type WorkerDocument } from './personnel.js'

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

export type ComplianceState = 'valid' | 'expiring' | 'expired' | 'missing'

export const COMPLIANCE_STATE_LABEL: Record<ComplianceState, string> = {
  valid: 'Действует',
  expiring: 'Истекает',
  expired: 'Просрочен',
  missing: 'Нет допуска',
}

export interface PositionRequirement {
  position: string
  qualificationTypeIds: QualificationTypeId[]
}

export type QualificationSource = Pick<WorkerDocument, 'id' | 'qualificationTypeId' | 'expiresAt'>

export interface QualificationCheck {
  typeId: QualificationTypeId
  state: ComplianceState
  expiresAt: string | null
  documentId: string | null
}

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

const STATE_RANK: Record<ComplianceState, number> = { valid: 0, expiring: 1, expired: 2, missing: 3 }

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

export function normalizePosition(position: string): string {
  return position.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru')
}

export function requiredForPosition(position: string, requirements: PositionRequirement[]): QualificationTypeId[] {
  const key = normalizePosition(position)
  return requirements.find((r) => normalizePosition(r.position) === key)?.qualificationTypeIds ?? []
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

export function qualificationState(doc: QualificationSource | null, today: string): ComplianceState {
  if (!doc) return 'missing'
  return doc.expiresAt ? trainingDocState(doc.expiresAt, today) : 'valid'
}

function unique(ids: QualificationTypeId[]): QualificationTypeId[] {
  return QUALIFICATION_TYPES.map((t) => t.id).filter((id) => ids.includes(id))
}

/** State of every qualification the worker's position requires. A missing one counts as not admitted. */
export function workerCompliance(
  worker: Pick<Worker, 'position' | 'documents'>,
  requirements: PositionRequirement[],
  today: string,
  extra: QualificationTypeId[] = [],
): QualificationCheck[] {
  return unique([...requiredForPosition(worker.position, requirements), ...extra]).map((typeId) => {
    const doc = bestQualificationDocument(worker.documents, typeId)
    return {
      typeId,
      state: qualificationState(doc, today),
      expiresAt: doc?.expiresAt ?? null,
      documentId: doc?.id ?? null,
    }
  })
}

/** Worst state across the checks; null when the position has no requirements. */
export function complianceSummary(checks: QualificationCheck[]): ComplianceState | null {
  if (!checks.length) return null
  return checks.reduce<ComplianceState>((worst, c) => (STATE_RANK[c.state] > STATE_RANK[worst] ? c.state : worst), 'valid')
}

export function isAdmitted(state: ComplianceState | null): boolean {
  return state !== 'expired' && state !== 'missing'
}

/**
 * Who in the brigade is not admitted on the start date or loses the admission before the end of the period.
 * Fired workers are skipped: they must not be in a brigade at all.
 */
export function assignmentCompliance(
  brigade: Pick<Brigade, 'memberIds'>,
  workers: Pick<Worker, 'id' | 'fullName' | 'position' | 'employment' | 'documents'>[],
  requirements: PositionRequirement[],
  objectRequirements: string[],
  period: { from: string; to: string },
): AssignmentIssue[] {
  const byId = new Map(workers.map((w) => [w.id, w]))
  const forObject = objectRequirements.filter(isQualificationTypeId)
  return brigade.memberIds.flatMap((id) => {
    const worker = byId.get(id)
    if (!worker || worker.employment === 'fired') return []
    const needed = unique([...requiredForPosition(worker.position, requirements), ...forObject])
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

export function validateRequirements(value: unknown): string | null {
  if (!Array.isArray(value)) return 'Некорректная матрица допусков'
  const seen = new Set<string>()
  for (const row of value as Partial<PositionRequirement>[]) {
    const position = typeof row?.position === 'string' ? normalizePosition(row.position) : ''
    if (!position) return 'Укажите должность'
    if (seen.has(position)) return `Должность «${row.position}» указана дважды`
    seen.add(position)
    if (!Array.isArray(row.qualificationTypeIds) || !row.qualificationTypeIds.every(isQualificationTypeId)) {
      return `Неизвестный допуск у должности «${row.position}»`
    }
  }
  return null
}

export function normalizeRequirements(list: PositionRequirement[]): PositionRequirement[] {
  return list
    .map((r) => ({ position: r.position.trim().replace(/\s+/g, ' '), qualificationTypeIds: unique(r.qualificationTypeIds) }))
    .sort((a, b) => a.position.localeCompare(b.position, 'ru'))
}

export function validateQualificationFields(meta: { qualificationTypeId?: string; group?: string; issuedAt?: string }): string | null {
  if (!meta.qualificationTypeId) return meta.group ? 'Группа указывается только для допуска' : null
  const type = qualificationType(meta.qualificationTypeId)
  if (!type) return 'Неизвестный вид допуска'
  if (meta.group && !type.hasGroup) return `Для допуска «${type.name}» группа не указывается`
  if (meta.issuedAt && !isIsoDate(meta.issuedAt)) return 'Некорректная дата выдачи'
  return null
}
