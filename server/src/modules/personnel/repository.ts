import { persisted, type AuditLog, type Storage } from '../../db.js'
import { badRequest, conflict, forbidden, notFound, nowIso, trimmed, uid, type StoredFile } from '../../http.js'
import {
  assignmentCompliance,
  assignmentConflict,
  brigadeOfWorker,
  canViewPii,
  defaultExpiry,
  describeAssignmentIssue,
  formatIsoDate,
  hasPastAssignments,
  isEmploymentStatus,
  isFutureAssignment,
  isOutsidePlan,
  isQualificationTypeId,
  membershipConflicts,
  normalizeRequirements,
  objectConflict,
  permissionLabel,
  rangeContains,
  todayIso,
  validateAssignmentDraft,
  validateBrigadeDraft,
  validateDocumentMeta,
  validateQualificationFields,
  validateRequirements,
  validateWorkerDraft,
  withoutWorker,
  workerHasHistory,
  workerStatus,
  type AssignmentDraft,
  type AssignmentOverride,
  type Brigade,
  type BrigadeAssignment,
  type BrigadeDraft,
  type CrewMember,
  type DocumentMeta,
  type ObjectCrew,
  type PositionRequirement,
  type RoleId,
  type User,
  type Worker,
  type WorkerDocument,
  type WorkerDraft,
  type WorkerPii,
} from '../../shared.js'
import type { ContractsRepository } from '../contracts/repository.js'
import { DEFAULT_REQUIREMENTS, personnelSeed, type PersonnelSeed, type WorkerRecord } from './seed.js'

const EMPTY_PII: WorkerPii = { snils: '', birthDate: '', passport: '' }

export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024
const OVERRIDE_COMMENT_MIN = 10

export interface PersonnelDeps {
  today?: () => string
  /** Equipment registered to a person with this full name, for the dismissal warning. */
  equipmentOf?: (fullName: string) => string[]
  audit?: AuditLog
  /** Cancels active knowledge checks of a dismissed worker; returns how many were cancelled. */
  onFired?: (workerId: string) => number
}

export interface AssignmentActor {
  user: User
  canOverride: boolean
}

export interface WithWarnings<T> {
  item: T
  warnings: string[]
}

function placeholderFile(worker: WorkerRecord, doc: WorkerDocument): StoredFile {
  const lines = [
    `Демо-документ ERP АММИР`,
    `Сотрудник: ${worker.fullName}`,
    `Документ: ${doc.title}`,
    ...(doc.expiresAt ? [`Действует до: ${formatIsoDate(doc.expiresAt)}`] : []),
  ]
  return { data: Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8'), mimeType: doc.mimeType }
}

function parsePii(value: unknown): WorkerPii | undefined {
  if (!value || typeof value !== 'object') return undefined
  const pii = value as Partial<WorkerPii>
  return { snils: trimmed(pii.snils), birthDate: trimmed(pii.birthDate), passport: trimmed(pii.passport) }
}

function parseWorkerDraft(body: Partial<WorkerDraft>): WorkerDraft {
  const draft: WorkerDraft = {
    fullName: trimmed(body.fullName).replace(/\s+/g, ' '),
    position: trimmed(body.position),
    phone: trimmed(body.phone),
    hiredAt: trimmed(body.hiredAt),
    note: trimmed(body.note),
    pii: parsePii(body.pii),
  }
  const error = validateWorkerDraft(draft)
  if (error) badRequest(error)
  return draft
}

function parseDocumentMeta(body: Partial<DocumentMeta>): DocumentMeta {
  const optional = (key: keyof DocumentMeta) => (trimmed(body[key]) ? { [key]: trimmed(body[key]) } : {})
  const meta: DocumentMeta = {
    title: trimmed(body.title),
    fileName: trimmed(body.fileName).replace(/[\\/:*?"<>|]+/g, '_'),
    ...optional('expiresAt'),
    ...optional('qualificationTypeId'),
    ...optional('number'),
    ...optional('issuedAt'),
    ...optional('issuer'),
    ...optional('group'),
  }
  if (isQualificationTypeId(meta.qualificationTypeId) && meta.issuedAt && !meta.expiresAt) {
    meta.expiresAt = defaultExpiry(meta.qualificationTypeId, meta.issuedAt)
  }
  const error = validateQualificationFields(meta) ?? validateDocumentMeta(meta)
  if (error) badRequest(error)
  return meta
}

function emptyPersonnel(): PersonnelSeed {
  return { workers: [], brigades: [], assignments: [], requirements: structuredClone(DEFAULT_REQUIREMENTS) }
}

export function createPersonnelRepository(contracts: ContractsRepository, storage: Storage, deps: PersonnelDeps = {}) {
  const today = deps.today ?? (() => todayIso())
  const snapshot = storage.snapshot<PersonnelSeed>('personnel', { seed: personnelSeed, empty: emptyPersonnel })
  const state = snapshot.state
  const files = storage.files('worker-documents')
  const photos = storage.files('worker-photos')

  function findWorker(id: string): WorkerRecord {
    return state.workers.find((w) => w.id === id) ?? notFound('Сотрудник не найден')
  }

  function findBrigade(id: string): Brigade {
    return state.brigades.find((b) => b.id === id) ?? notFound('Бригада не найдена')
  }

  function toWorker(record: WorkerRecord, role: RoleId): Worker {
    const brigade = brigadeOfWorker(record.id, state.brigades)
    return structuredClone({
      ...record,
      pii: canViewPii(role) ? record.pii : null,
      brigadeId: brigade?.id ?? null,
      status: workerStatus(brigade?.id ?? null, state.assignments, today()),
    })
  }

  function crewMember(id: string): CrewMember | null {
    const w = state.workers.find((x) => x.id === id)
    if (!w || w.employment === 'fired') return null
    return { id: w.id, fullName: w.fullName, position: w.position, employment: w.employment }
  }

  function isBusyToday(match: (a: BrigadeAssignment) => boolean): boolean {
    return state.assignments.some((a) => match(a) && rangeContains(a.from, a.to, today()))
  }

  function dropFutureAssignments(match: (a: BrigadeAssignment) => boolean) {
    state.assignments = state.assignments.filter((a) => !(match(a) && isFutureAssignment(a, today())))
  }

  function parseBrigadeDraft(body: Partial<BrigadeDraft>, editingId: string | null): BrigadeDraft {
    const ids = (value: unknown) => (Array.isArray(value) ? value.map((id) => trimmed(id)).filter(Boolean) : [])
    const memberIds = ids(body.memberIds)
    const draft: BrigadeDraft = {
      name: trimmed(body.name),
      masterIds: ids(body.masterIds),
      foremanIds: ids(body.foremanIds),
      memberIds,
    }
    for (const id of memberIds) {
      if (findWorker(id).employment === 'fired') badRequest('Уволенного сотрудника нельзя включить в бригаду')
    }
    const error = validateBrigadeDraft(draft, state.brigades, editingId)
    if (error && membershipConflicts(memberIds, state.brigades, editingId).length) conflict(error)
    if (error) badRequest(error)
    return draft
  }

  function parseAssignmentDraft(body: Partial<AssignmentDraft>, editingId: string | null) {
    const draft: AssignmentDraft = {
      brigadeId: trimmed(body.brigadeId),
      contractId: trimmed(body.contractId),
      objectId: trimmed(body.objectId),
      from: trimmed(body.from),
      to: trimmed(body.to),
      note: trimmed(body.note),
    }
    const error = validateAssignmentDraft(draft)
    if (error) badRequest(error)
    const brigade = findBrigade(draft.brigadeId)
    if (brigade.archived) conflict('Бригада в архиве — назначение невозможно')
    const found = contracts.findObject(draft.objectId)
    if (!found || found.contract.id !== draft.contractId) notFound('Объект договора не найден')
    if (found.contract.archived || found.object.archived) conflict('Объект в архиве — назначение невозможно')
    const clash = assignmentConflict(draft, state.assignments, editingId)
    if (clash) {
      const place = contracts.findObject(clash.objectId)?.object.name ?? clash.objectId
      conflict(`Бригада уже назначена на «${place}» с ${formatIsoDate(clash.from)} по ${formatIsoDate(clash.to)}`)
    }
    const taken = objectConflict(draft, state.assignments, editingId)
    if (taken) {
      const holder = state.brigades.find((b) => b.id === taken.brigadeId)?.name ?? taken.brigadeId
      conflict(`На объекте уже работает ${holder} с ${formatIsoDate(taken.from)} по ${formatIsoDate(taken.to)}`)
    }
    return { draft, brigade, object: found.object }
  }

  /** Qualification gate: blocks with 409 unless an authorised planner gives a justification. */
  function checkCompliance(
    actor: AssignmentActor,
    body: Partial<AssignmentDraft>,
    editingId: string | null,
  ): WithWarnings<AssignmentDraft & { override?: AssignmentOverride }> {
    const { draft, brigade, object } = parseAssignmentDraft(body, editingId)
    const warnings = isOutsidePlan(object, draft)
      ? [
          `Период назначения выходит за плановые сроки объекта (${formatIsoDate(object.plannedStart)} — ${formatIsoDate(object.plannedEnd)})`,
        ]
      : []
    const issues = assignmentCompliance(
      brigade,
      state.workers,
      state.requirements,
      object.requiredQualificationIds ?? [],
      draft,
    )
    if (!issues.length) return { item: draft, warnings }

    const comment = trimmed(body.overrideComment)
    if (!comment) {
      conflict('Не у всех сотрудников бригады есть действующие допуски на период назначения', {
        issues,
        canOverride: actor.canOverride,
      })
    }
    if (!actor.canOverride) forbidden(`Недостаточно прав: «${permissionLabel('brigades_override')}»`)
    if (comment.length < OVERRIDE_COMMENT_MIN) {
      badRequest(`Опишите причину назначения без допусков (не короче ${OVERRIDE_COMMENT_MIN} символов)`)
    }
    const override: AssignmentOverride = { comment, by: actor.user.fullName, at: nowIso() }
    deps.audit?.record({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'assignment_override',
      details: [
        `${brigade.name} → ${object.name}, ${formatIsoDate(draft.from)} — ${formatIsoDate(draft.to)}`,
        `Обоснование: ${comment}`,
        ...issues.map(describeAssignmentIssue),
      ].join('\n'),
    })
    return { item: { ...draft, override }, warnings: [...warnings, `Назначено без допусков: ${issues.length} замеч.`] }
  }

  const repository = {
    listWorkers(role: RoleId): Worker[] {
      return state.workers.map((w) => toWorker(w, role))
    },

    /** Minimal worker data for other modules; no PII. */
    directory() {
      return state.workers.map((w) => ({
        id: w.id,
        fullName: w.fullName,
        position: w.position,
        phone: w.phone,
        employment: w.employment,
        brigadeId: brigadeOfWorker(w.id, state.brigades)?.id ?? null,
      }))
    },

    getWorker(role: RoleId, id: string): Worker {
      return toWorker(findWorker(id), role)
    },

    createWorker(role: RoleId, body: Partial<WorkerDraft>): Worker {
      const draft = parseWorkerDraft(body)
      if (draft.pii && !canViewPii(role)) forbidden('ПДн может вносить только роль «Администратор»')
      const record: WorkerRecord = {
        id: uid('p'),
        fullName: draft.fullName,
        position: draft.position,
        phone: draft.phone,
        hiredAt: draft.hiredAt,
        note: draft.note,
        employment: 'active',
        photoUpdatedAt: null,
        documents: [],
        pii: draft.pii ?? { ...EMPTY_PII },
      }
      state.workers.unshift(record)
      return toWorker(record, role)
    },

    updateWorker(role: RoleId, id: string, body: Partial<WorkerDraft>): Worker {
      const record = findWorker(id)
      const draft = parseWorkerDraft(body)
      if (draft.pii && !canViewPii(role)) forbidden('ПДн может изменять только роль «Администратор»')
      Object.assign(record, {
        fullName: draft.fullName,
        position: draft.position,
        phone: draft.phone,
        hiredAt: draft.hiredAt,
        note: draft.note,
      })
      if (draft.pii) record.pii = draft.pii
      return toWorker(record, role)
    },

    /** Physical deletion is allowed only for a worker without history; otherwise dismiss them. */
    removeWorker(id: string): void {
      const record = findWorker(id)
      if (workerHasHistory(record, state.brigades, state.assignments)) {
        conflict('У сотрудника есть документы или назначения — переведите его в статус «Уволен»')
      }
      photos.delete(id)
      state.workers = state.workers.filter((w) => w.id !== id)
      state.brigades = state.brigades.map((b) => withoutWorker(b, id))
    },

    setEmployment(role: RoleId, id: string, value: unknown): WithWarnings<Worker> {
      if (!isEmploymentStatus(value)) badRequest('Неизвестный статус сотрудника')
      const record = findWorker(id)
      record.employment = value
      const warnings: string[] = []
      if (value === 'fired') {
        const left = state.brigades.filter((b) => b.memberIds.includes(id))
        state.brigades = state.brigades.map((b) => withoutWorker(b, id))
        if (left.length) warnings.push(`Выведен из состава: ${left.map((b) => b.name).join(', ')}`)
        const items = deps.equipmentOf?.(record.fullName) ?? []
        if (items.length) warnings.push(`За сотрудником числится оборудование: ${items.join('; ')}`)
        const cancelled = deps.onFired?.(id) ?? 0
        if (cancelled) warnings.push(`Отозваны назначенные проверки знаний: ${cancelled}`)
      }
      return { item: toWorker(record, role), warnings }
    },

    addDocument(role: RoleId, workerId: string, body: Partial<DocumentMeta>, file: StoredFile): Worker {
      const record = findWorker(workerId)
      const meta = parseDocumentMeta(body)
      if (!file.data.length) badRequest('Файл пустой')
      if (file.data.length > DOCUMENT_MAX_BYTES) badRequest('Файл больше 20 МБ')
      const doc: WorkerDocument = {
        id: uid('doc'),
        ...meta,
        mimeType: file.mimeType || 'application/octet-stream',
        size: file.data.length,
        uploadedAt: nowIso(),
      }
      files.set(doc.id, { data: file.data, mimeType: doc.mimeType })
      record.documents.unshift(doc)
      return toWorker(record, role)
    },

    removeDocument(role: RoleId, workerId: string, docId: string): Worker {
      const record = findWorker(workerId)
      if (!record.documents.some((d) => d.id === docId)) notFound('Документ не найден')
      record.documents = record.documents.filter((d) => d.id !== docId)
      files.delete(docId)
      return toWorker(record, role)
    },

    documentFile(workerId: string, docId: string): { doc: WorkerDocument; file: StoredFile } {
      const record = findWorker(workerId)
      const doc = record.documents.find((d) => d.id === docId) ?? notFound('Документ не найден')
      return { doc: structuredClone(doc), file: files.get(docId) ?? placeholderFile(record, doc) }
    },

    setPhoto(role: RoleId, id: string, file: StoredFile): Worker {
      const record = findWorker(id)
      if (!file.mimeType.startsWith('image/')) badRequest('Фото должно быть изображением')
      if (!file.data.length) badRequest('Файл пустой')
      if (file.data.length > PHOTO_MAX_BYTES) badRequest('Фото больше 5 МБ')
      photos.set(id, file)
      record.photoUpdatedAt = nowIso()
      return toWorker(record, role)
    },

    removePhoto(role: RoleId, id: string): Worker {
      const record = findWorker(id)
      photos.delete(id)
      record.photoUpdatedAt = null
      return toWorker(record, role)
    },

    photo(id: string): StoredFile {
      findWorker(id)
      return photos.get(id) ?? notFound('Фото не загружено')
    },

    requirements(): PositionRequirement[] {
      return structuredClone(state.requirements)
    },

    setRequirements(value: unknown): PositionRequirement[] {
      const error = validateRequirements(value)
      if (error) badRequest(error)
      state.requirements = normalizeRequirements(value as PositionRequirement[])
      return structuredClone(state.requirements)
    },

    listBrigades(): Brigade[] {
      return structuredClone(state.brigades)
    },

    createBrigade(body: Partial<BrigadeDraft>): Brigade {
      const brigade: Brigade = { id: uid('b'), ...parseBrigadeDraft(body, null) }
      state.brigades.push(brigade)
      return structuredClone(brigade)
    },

    updateBrigade(id: string, body: Partial<BrigadeDraft>): Brigade {
      const brigade = findBrigade(id)
      if (brigade.archived) conflict('Бригада в архиве — сначала верните её из архива')
      Object.assign(brigade, parseBrigadeDraft(body, id))
      return structuredClone(brigade)
    },

    /** Deletes a brigade without past assignments together with its future ones. */
    removeBrigade(id: string): void {
      findBrigade(id)
      if (hasPastAssignments(state.assignments, (a) => a.brigadeId === id, today())) {
        conflict('У бригады есть прошлые или текущие назначения — отправьте её в архив')
      }
      state.brigades = state.brigades.filter((b) => b.id !== id)
      dropFutureAssignments((a) => a.brigadeId === id)
    },

    setBrigadeArchived(id: string, archived: boolean): Brigade {
      const brigade = findBrigade(id)
      if (archived) {
        if (isBusyToday((a) => a.brigadeId === id)) conflict('Бригада сейчас работает на объекте — сначала завершите назначение')
        dropFutureAssignments((a) => a.brigadeId === id)
        brigade.archived = true
      } else {
        if (membershipConflicts(brigade.memberIds, state.brigades, id).length) {
          conflict('Часть состава уже работает в других бригадах — вернуть бригаду из архива нельзя')
        }
        delete brigade.archived
      }
      return structuredClone(brigade)
    },

    listAssignments(filter: { objectId?: string; brigadeId?: string }): BrigadeAssignment[] {
      return structuredClone(
        state.assignments
          .filter((a) => !filter.objectId || a.objectId === filter.objectId)
          .filter((a) => !filter.brigadeId || a.brigadeId === filter.brigadeId)
          .sort((a, b) => a.from.localeCompare(b.from)),
      )
    },

    createAssignment(actor: AssignmentActor, body: Partial<AssignmentDraft>): WithWarnings<BrigadeAssignment> {
      const { item, warnings } = checkCompliance(actor, body, null)
      const assignment: BrigadeAssignment = { id: uid('a'), ...item }
      state.assignments.push(assignment)
      return { item: structuredClone(assignment), warnings }
    },

    updateAssignment(actor: AssignmentActor, id: string, body: Partial<AssignmentDraft>): WithWarnings<BrigadeAssignment> {
      const index = state.assignments.findIndex((a) => a.id === id)
      if (index < 0) notFound('Назначение не найдено')
      const { item, warnings } = checkCompliance(actor, body, id)
      state.assignments[index] = { id, ...item }
      return { item: structuredClone(state.assignments[index]), warnings }
    },

    removeAssignment(id: string): void {
      if (!state.assignments.some((a) => a.id === id)) notFound('Назначение не найдено')
      state.assignments = state.assignments.filter((a) => a.id !== id)
    },

    hasObjectHistory(objectId: string): boolean {
      return hasPastAssignments(state.assignments, (a) => a.objectId === objectId, today())
    },

    isObjectBusy(objectId: string): boolean {
      return isBusyToday((a) => a.objectId === objectId)
    },

    removeAssignmentsForObject(objectId: string): void {
      state.assignments = state.assignments.filter((a) => a.objectId !== objectId)
    },

    removeFutureAssignmentsForObject(objectId: string): void {
      dropFutureAssignments((a) => a.objectId === objectId)
    },

    /** Crew on duty: fired workers are excluded, vacation is reported through `employment`. */
    crew(objectId: string, date: string): ObjectCrew[] {
      return state.assignments
        .filter((a) => a.objectId === objectId && rangeContains(a.from, a.to, date))
        .map((assignment) => {
          const brigade = findBrigade(assignment.brigadeId)
          const people = (ids: string[]) => ids.map(crewMember).filter((m): m is CrewMember => m !== null)
          const leaders = new Set([...brigade.masterIds, ...brigade.foremanIds])
          return {
            assignment: structuredClone(assignment),
            brigadeName: brigade.name,
            masters: people(brigade.masterIds),
            foremen: people(brigade.foremanIds),
            members: people(brigade.memberIds.filter((id) => !leaders.has(id))),
          }
        })
    },
  }

  return persisted(
    repository,
    [
      'createWorker',
      'updateWorker',
      'removeWorker',
      'setEmployment',
      'addDocument',
      'removeDocument',
      'setPhoto',
      'removePhoto',
      'setRequirements',
      'createBrigade',
      'updateBrigade',
      'removeBrigade',
      'setBrigadeArchived',
      'createAssignment',
      'updateAssignment',
      'removeAssignment',
      'removeAssignmentsForObject',
      'removeFutureAssignmentsForObject',
    ],
    () => snapshot.save(state),
  )
}

export type PersonnelRepository = ReturnType<typeof createPersonnelRepository>
