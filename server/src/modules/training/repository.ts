import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { persisted, type AuditLog, type Storage } from '../../db.js'
import { HttpError, badRequest, conflict, forbidden, notFound, nowIso, trimmed, uid, type StoredFile } from '../../http.js'
import {
  ANSWER_GRACE_MS,
  EXTRAORDINARY_REASON_LABEL,
  EXTRAORDINARY_REASON_SHORT,
  IMAGE_MAX_BYTES,
  MATERIAL_MAX_BYTES,
  PHONE_ATTEMPTS,
  PHONE_LOCK_MS,
  SKIP_REASON_LABEL,
  TEST_IMAGES_FOLDER,
  TEST_SESSION_MS,
  assignmentMessage,
  assignmentStatus,
  canAssignWorker,
  drawQuestions,
  formatIsoDate,
  isActiveAssignment,
  isDirectionKind,
  isExtraordinaryReason,
  isImageFile,
  materialMimeType,
  nextDueDate,
  phoneLast4,
  programLabel,
  programTitle,
  questionsPerAttempt,
  scoreAttempt,
  shortName,
  testSummary,
  toPublicQuestion,
  todayIso,
  trainingCounters,
  validateAnnulReason,
  validateDirectionDraft,
  validateMaterialDraft,
  validateProgramDraft,
  validateTestAssignmentDraft,
  validateTestDraft,
  workerProgramStatuses,
  worstProgramState,
  type AssignmentResult,
  type AssignmentView,
  type AttemptSummary,
  type CertificationRecord,
  type CreatedAssignment,
  type DirectionDraft,
  type DirectionWithPrograms,
  type ElectricalScope,
  type EmploymentStatus,
  type ExtraordinaryReason,
  type FinishReason,
  type LinkView,
  type ProgramDraft,
  type ProgramStatus,
  type QuestionImage,
  type TestAssignment,
  type WorkerCertifications,
  type PublicAttempt,
  type PublicMaterial,
  type PublicResult,
  type PublicTestView,
  type SkipReason,
  type SkippedWorker,
  type StorageCheck,
  type TestAssignmentDraft,
  type TestAttempt,
  type TestContent,
  type TestQuestion,
  type TestSummary,
  type TrainingDirection,
  type TrainingMaterial,
  type TrainingProgram,
  type TrainingSummary,
  type TrainingTest,
} from '../../shared.js'
import { isFileUnavailable, type StorageFolder, type TrainingStorage } from './bitrix.js'
import { emptyTraining, type AssignmentRecord, type TrainingState } from './model.js'

export interface TrainingWorker {
  id: string
  fullName: string
  position: string
  phone: string
  employment: EmploymentStatus
  brigadeId: string | null
}

export interface TrainingDeps {
  workers: () => TrainingWorker[]
  today?: () => string
  now?: () => number
  audit?: AuditLog
  random?: () => number
}

export interface Actor {
  id: string
  fullName: string
}

interface TestSession {
  assignmentId: string
  tokenHash: string
  expiresAt: number
}

const LINK_PATH = '/t/'
const ID_FORMAT = /^[\w-]{1,64}$/

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function int(value: unknown, fallback: number): number {
  const n = typeof value === 'string' && value.trim() ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}

function nullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  return int(value, NaN)
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.map((v) => trimmed(v)).filter(Boolean))] : []
}

function idOf(value: unknown, prefix: string): string {
  const id = trimmed(value)
  return ID_FORMAT.test(id) ? id : uid(prefix)
}

function parseElectrical(value: unknown): ElectricalScope | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<ElectricalScope>
  return {
    personnelKind: v.personnelKind as ElectricalScope['personnelKind'],
    group: v.group as ElectricalScope['group'],
    voltage: (v.voltage || null) as ElectricalScope['voltage'],
  }
}

function parseImage(value: unknown): QuestionImage | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<QuestionImage>
  const fileId = trimmed(v.fileId)
  return fileId ? { fileId, fileName: trimmed(v.fileName), mimeType: trimmed(v.mimeType) || 'image/png' } : null
}

function parseQuestions(value: unknown): TestQuestion[] {
  if (!Array.isArray(value)) return []
  if (value.length > 300) badRequest('В тесте не больше 300 вопросов')
  return value.map((raw: Partial<TestQuestion>) => {
    const options = (Array.isArray(raw?.options) ? raw.options : []).map((o: Partial<{ id: string; text: string }>) => ({
      id: idOf(o?.id, 'o'),
      text: typeof o?.text === 'string' ? o.text.trim() : '',
    }))
    const optionIds = new Set(options.map((o) => o.id))
    return {
      id: idOf(raw?.id, 'q'),
      text: typeof raw?.text === 'string' ? raw.text.trim() : '',
      kind: raw?.kind === 'multiple' ? 'multiple' : 'single',
      image: parseImage(raw?.image),
      options,
      correctOptionIds: strings(raw?.correctOptionIds).filter((id) => optionIds.has(id)),
      explanation: typeof raw?.explanation === 'string' ? raw.explanation.trim() : '',
      weight: int(raw?.weight, 1),
    }
  })
}

function parseContent(body: Partial<Record<keyof TestContent, unknown>>, current?: TestContent): TestContent {
  const has = (key: keyof TestContent) => key in body
  return {
    title: has('title') ? trimmed(body.title) : (current?.title ?? ''),
    programId: has('programId') ? trimmed(body.programId) : (current?.programId ?? ''),
    electrical: has('electrical') ? parseElectrical(body.electrical) : (current?.electrical ?? null),
    description: has('description') ? trimmed(body.description) : (current?.description ?? ''),
    materialIds: has('materialIds') ? strings(body.materialIds) : (current?.materialIds ?? []),
    isMaterialsRequired: bool(body.isMaterialsRequired, current?.isMaterialsRequired ?? false),
    questions: has('questions') ? parseQuestions(body.questions) : structuredClone(current?.questions ?? []),
    questionsPerAttempt: has('questionsPerAttempt') ? nullableInt(body.questionsPerAttempt) : (current?.questionsPerAttempt ?? null),
    passPercent: has('passPercent') ? int(body.passPercent, NaN) : (current?.passPercent ?? 80),
    timeLimitMin: has('timeLimitMin') ? nullableInt(body.timeLimitMin) : (current?.timeLimitMin ?? null),
    attemptsPerAssignment: has('attemptsPerAssignment') ? int(body.attemptsPerAssignment, NaN) : (current?.attemptsPerAssignment ?? 2),
    isShuffled: bool(body.isShuffled, current?.isShuffled ?? true),
    isAnswersShown: bool(body.isAnswersShown, current?.isAnswersShown ?? true),
  }
}

function contentOf(test: TrainingTest): TestContent {
  const { id: _id, status: _status, version: _version, updatedAt: _at, updatedBy: _by, ...content } = test
  return structuredClone(content)
}

function toAssignment(record: AssignmentRecord, today: string): TestAssignment {
  const { tokenHash: _hash, tokenSecret: _secret, phoneFailures: _failures, lockedUntil: _locked, ...rest } = record
  return { ...structuredClone(rest), status: assignmentStatus(record, today) }
}

function summarizeAttempt(attempt: TestAttempt): AttemptSummary {
  return {
    id: attempt.id,
    assignmentId: attempt.assignmentId,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
    score: attempt.score,
    maxScore: attempt.maxScore,
    percent: attempt.percent,
    isPassed: attempt.isPassed,
    finishReason: attempt.finishReason,
  }
}

export function createTrainingRepository(storage: Storage, disk: TrainingStorage, deps: TrainingDeps) {
  const today = deps.today ?? (() => todayIso())
  const now = deps.now ?? Date.now
  const random = deps.random ?? Math.random
  const snapshot = storage.snapshot<TrainingState>('training', { empty: emptyTraining })
  const state = snapshot.state
  const secret = storage.snapshot<{ key: string }>('training-secret', {
    empty: () => ({ key: randomBytes(32).toString('base64') }),
  })
  const key = Buffer.from(secret.state.key, 'base64')
  const sessions = new Map<string, TestSession>()
  /** Images uploaded in the editor but not saved into a question yet. */
  const freshImages = new Set<string>()

  const save = () => snapshot.save(state)

  // ─── Lookups ──────────────────────────────────────────────────────────

  function findDirection(id: string): TrainingDirection {
    return state.directions.find((d) => d.id === id) ?? notFound('Направление не найдено')
  }

  function findProgram(id: string): TrainingProgram {
    return state.programs.find((p) => p.id === id) ?? notFound('Программа не найдена')
  }

  function findMaterial(id: string): TrainingMaterial {
    return state.materials.find((m) => m.id === id) ?? notFound('Материал не найден')
  }

  function findTest(id: string): TrainingTest {
    return state.tests.find((t) => t.id === id) ?? notFound('Тест не найден')
  }

  function findAssignment(id: string): AssignmentRecord {
    return state.assignments.find((a) => a.id === id) ?? notFound('Назначение не найдено')
  }

  function directionOf(program: TrainingProgram): TrainingDirection | null {
    return state.directions.find((d) => d.id === program.directionId) ?? null
  }

  function labelOf(programId: string): string {
    const program = state.programs.find((p) => p.id === programId)
    return program ? programLabel(program, directionOf(program)) : programId
  }

  function titleOf(programId: string): string {
    const program = state.programs.find((p) => p.id === programId)
    return program ? programTitle(program, directionOf(program)) : programId
  }

  function workerMap(): Map<string, TrainingWorker> {
    return new Map(deps.workers().map((w) => [w.id, w]))
  }

  function versionOf(assignment: Pick<TestAssignment, 'testId' | 'testVersion'>): TestContent {
    return state.versions[`${assignment.testId}:${assignment.testVersion}`] ?? notFound('Версия теста не найдена')
  }

  function view(record: AssignmentRecord, workers = workerMap()): AssignmentView {
    const worker = workers.get(record.workerId)
    const test = state.tests.find((t) => t.id === record.testId)
    return {
      ...toAssignment(record, today()),
      workerName: worker?.fullName ?? 'Сотрудник удалён',
      workerPhone: worker?.phone ?? '',
      testTitle: test?.title ?? '',
      programLabel: labelOf(record.programId),
    }
  }

  function strippedAssignments(): TestAssignment[] {
    return state.assignments.map((a) => toAssignment(a, today()))
  }

  // ─── Tokens and links ─────────────────────────────────────────────────

  function encrypt(token: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
    return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.')
  }

  function decrypt(value: string): string {
    const [iv, tag, data] = value.split('.').map((p) => Buffer.from(p, 'base64url'))
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  }

  function issueToken(record: AssignmentRecord): string {
    const token = randomBytes(24).toString('base64url')
    record.tokenHash = hashToken(token)
    record.tokenSecret = encrypt(token)
    record.phoneFailures = 0
    record.lockedUntil = 0
    for (const [id, session] of sessions) if (session.assignmentId === record.id) sessions.delete(id)
    return token
  }

  function linkView(record: AssignmentRecord, origin: string, token: string, workers = workerMap()): LinkView {
    const link = `${origin.replace(/\/$/, '')}${LINK_PATH}${token}`
    const worker = workers.get(record.workerId)
    return {
      link,
      message: assignmentMessage({ fullName: worker?.fullName ?? '', programName: titleOf(record.programId), dueDate: record.dueDate, link }),
    }
  }

  // ─── Folders in Bitrix ────────────────────────────────────────────────

  async function folderOf(program: TrainingProgram): Promise<StorageFolder> {
    if (program.bitrixFolderId) return { folderId: program.bitrixFolderId, path: program.storagePath }
    const direction = directionOf(program) ?? notFound('Направление программы не найдено')
    const folder = await disk.ensureProgramFolder(direction.name, program.code === direction.code ? direction.name : program.code)
    program.bitrixFolderId = folder.folderId
    program.storagePath = folder.path
    save()
    return folder
  }

  async function fileOrUnavailable(material: TrainingMaterial): Promise<StoredFile> {
    try {
      const file = await disk.getFile(material.bitrixFileId)
      if (material.isUnavailable) {
        material.isUnavailable = false
        save()
      }
      return file
    } catch (error) {
      if (isFileUnavailable(error) && !material.isUnavailable) {
        material.isUnavailable = true
        save()
      }
      throw error
    }
  }

  // ─── Records and attempts ─────────────────────────────────────────────

  function createRecord(assignment: AssignmentRecord, attempt: TestAttempt | null, isPassed: boolean, percent: number) {
    const program = findProgram(assignment.programId)
    const passedAt = today()
    const content = state.versions[`${assignment.testId}:${assignment.testVersion}`]
    state.records.push({
      id: uid('rec'),
      workerId: assignment.workerId,
      programId: assignment.programId,
      assignmentId: assignment.id,
      attemptId: attempt?.id ?? null,
      kind: assignment.kind,
      reason: assignment.reason,
      isPassed,
      percent,
      passedAt,
      createdAt: nowIso(),
      nextDueAt: isPassed ? nextDueDate(passedAt, program.periodMonths) : null,
      electrical: isPassed ? (content?.electrical ?? null) : null,
      isAnnulled: false,
      annulReason: '',
      annulledBy: '',
    })
  }

  function activeAttempt(assignmentId: string): TestAttempt | null {
    return state.attempts.find((a) => a.assignmentId === assignmentId && !a.finishedAt) ?? null
  }

  function lastFinishedAttempt(assignmentId: string): TestAttempt | null {
    return (
      state.attempts
        .filter((a) => a.assignmentId === assignmentId && a.finishedAt && a.finishReason !== 'cancelled')
        .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))[0] ?? null
    )
  }

  function finalize(assignment: AssignmentRecord, attempt: TestAttempt, reason: FinishReason) {
    const content = versionOf(assignment)
    const score = scoreAttempt(attempt.questionSnapshot, attempt.answers, content.passPercent)
    Object.assign(attempt, score, { finishedAt: new Date(now()).toISOString(), finishReason: reason })
    if (score.isPassed) {
      assignment.status = 'passed'
      assignment.finishedAt = attempt.finishedAt
      createRecord(assignment, attempt, true, score.percent)
    } else if (assignment.attemptsUsed < assignment.attemptsAllowed) {
      assignment.status = 'opened'
    } else {
      assignment.status = 'failed'
      assignment.finishedAt = attempt.finishedAt
      createRecord(assignment, attempt, false, score.percent)
    }
  }

  function isTimedOut(attempt: TestAttempt): boolean {
    return Boolean(attempt.deadlineAt) && now() > Date.parse(attempt.deadlineAt as string) + ANSWER_GRACE_MS
  }

  /** Server-side timer: an attempt past its deadline is finished with `timeout` on the next access. */
  function settle(assignment: AssignmentRecord): boolean {
    const attempt = activeAttempt(assignment.id)
    if (!attempt || !isTimedOut(attempt)) return false
    finalize(assignment, attempt, 'timeout')
    save()
    return true
  }

  function settleAll() {
    for (const assignment of state.assignments) if (assignment.status === 'in_progress') settle(assignment)
  }

  function cancelRecord(assignment: AssignmentRecord, reason: string) {
    const attempt = activeAttempt(assignment.id)
    if (attempt) Object.assign(attempt, { finishedAt: new Date(now()).toISOString(), finishReason: 'cancelled' satisfies FinishReason })
    assignment.status = 'cancelled'
    assignment.cancelReason = reason
    assignment.finishedAt = nowIso()
    for (const [id, session] of sessions) if (session.assignmentId === assignment.id) sessions.delete(id)
  }

  function statusesOf(worker: Pick<TrainingWorker, 'id' | 'position'>, assignments = strippedAssignments()): ProgramStatus[] {
    return workerProgramStatuses(worker, state.programs, state.records, assignments, today())
  }

  // ─── Public flow helpers ──────────────────────────────────────────────

  function byToken(token: string): AssignmentRecord {
    const hash = hashToken(token)
    const record = token ? state.assignments.find((a) => a.tokenHash && sameHash(a.tokenHash, hash)) : undefined
    if (!record || record.status === 'cancelled') throw new HttpError(410, 'Ссылка больше недействительна')
    settle(record)
    return record
  }

  function sessionOf(record: AssignmentRecord, sessionToken: string | null): boolean {
    if (!sessionToken) return false
    const session = sessions.get(sessionToken)
    if (!session || session.expiresAt < now() || session.assignmentId !== record.id || session.tokenHash !== record.tokenHash) {
      return false
    }
    return true
  }

  function requireVerified(record: AssignmentRecord, sessionToken: string | null) {
    if (!sessionOf(record, sessionToken)) forbidden('Подтвердите личность: введите последние 4 цифры телефона')
  }

  function requireOpen(record: AssignmentRecord) {
    const status = assignmentStatus(record, today())
    if (status === 'expired') throw new HttpError(410, 'Срок прохождения истёк — ссылка больше недействительна')
    if (status === 'passed' || status === 'failed') conflict('Проверка уже завершена')
  }

  function publicResult(record: AssignmentRecord): PublicResult | null {
    const attempt = lastFinishedAttempt(record.id)
    if (!attempt) return null
    const content = versionOf(record)
    const isOver = record.status === 'passed' || record.status === 'failed'
    const answers = new Map(attempt.answers.map((a) => [a.questionId, a.optionIds]))
    const passedRecord = state.records.find((r) => r.attemptId === attempt.id && r.isPassed)
    return {
      score: attempt.score,
      maxScore: attempt.maxScore,
      percent: attempt.percent,
      isPassed: attempt.isPassed,
      passPercent: content.passPercent,
      attemptsLeft: Math.max(0, record.attemptsAllowed - record.attemptsUsed),
      nextDueAt: passedRecord?.nextDueAt ?? null,
      finishReason: attempt.finishReason,
      review: content.isAnswersShown
        ? attempt.questionSnapshot.map((q) => {
            const chosenIds = answers.get(q.id) ?? []
            const score = scoreAttempt([q], [{ questionId: q.id, optionIds: chosenIds }], 100)
            return {
              questionId: q.id,
              text: q.text,
              image: q.image,
              options: q.options.map((o) => ({ id: o.id, text: o.text })),
              chosenIds,
              correctIds: isOver ? [...q.correctOptionIds] : null,
              isCorrect: score.isPassed,
              explanation: isOver ? q.explanation : '',
            }
          })
        : null,
    }
  }

  function publicAttempt(attempt: TestAttempt): PublicAttempt {
    return {
      id: attempt.id,
      questions: attempt.questionSnapshot.map(toPublicQuestion),
      answers: attempt.answers.map((a) => ({ questionId: a.questionId, optionIds: [...a.optionIds] })),
      deadlineAt: attempt.deadlineAt,
      serverNow: new Date(now()).toISOString(),
    }
  }

  // ─── Parsing ──────────────────────────────────────────────────────────

  function parseDirection(body: Partial<Record<keyof DirectionDraft, unknown>>, editingId: string | null): DirectionDraft {
    const current = editingId ? findDirection(editingId) : null
    const draft: DirectionDraft = {
      name: 'name' in body ? trimmed(body.name) : (current?.name ?? ''),
      code: 'code' in body ? trimmed(body.code) : (current?.code ?? ''),
      kind: (isDirectionKind(body.kind) ? body.kind : (current?.kind ?? body.kind)) as DirectionDraft['kind'],
      order: int(body.order, current?.order ?? state.directions.length + 1),
    }
    const error = validateDirectionDraft(draft, state.directions.filter((d) => d.id !== editingId))
    if (error) badRequest(error)
    return draft
  }

  function parseProgram(body: Partial<Record<keyof ProgramDraft, unknown>>, directionId: string, editing: TrainingProgram | null): ProgramDraft {
    const draft: ProgramDraft = {
      code: 'code' in body ? trimmed(body.code) : (editing?.code ?? ''),
      name: 'name' in body ? trimmed(body.name) : (editing?.name ?? ''),
      periodMonths: 'periodMonths' in body ? int(body.periodMonths, NaN) : (editing?.periodMonths ?? NaN),
      expiringDays: 'expiringDays' in body ? int(body.expiringDays, NaN) : (editing?.expiringDays ?? 30),
    }
    const siblings = state.programs.filter((p) => p.directionId === directionId && p.id !== editing?.id)
    const error = validateProgramDraft(draft, siblings)
    if (error) badRequest(error)
    return draft
  }

  function checkTestContent(content: TestContent, forPublish: boolean) {
    const program = findProgram(content.programId)
    const direction = directionOf(program) ?? notFound('Направление программы не найдено')
    const error = validateTestDraft(content, { kind: direction.kind, forPublish })
    if (error) badRequest(error)
    const unknown = content.materialIds.find((id) => !state.materials.some((m) => m.id === id))
    if (unknown) badRequest('Материал не найден')
    if (content.questions.some((q) => q.image && !isImageFile(q.image.fileName || 'x.png'))) badRequest('Картинка вопроса должна быть изображением')
  }

  function assertProgramUsable(program: TrainingProgram) {
    const direction = directionOf(program)
    if (program.isArchived || !direction || direction.isArchived) conflict('Программа в архиве — назначение невозможно')
  }

  function requiredMaterialsWarning(content: TestContent): string[] {
    if (!content.isMaterialsRequired) return []
    const broken = content.materialIds.map((id) => state.materials.find((m) => m.id === id)).filter((m) => m?.isUnavailable)
    return broken.length
      ? [`Обязательные материалы недоступны в Битрикс: ${broken.map((m) => `«${m?.title}»`).join(', ')} — сотрудник не сможет начать тест`]
      : []
  }

  // ─── Repository ───────────────────────────────────────────────────────

  const repository = {
    async checkStorage(): Promise<StorageCheck> {
      return disk.check()
    },

    listDirections(): DirectionWithPrograms[] {
      return [...state.directions]
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ru'))
        .map((d) => ({ ...structuredClone(d), programs: structuredClone(state.programs.filter((p) => p.directionId === d.id)) }))
    },

    createDirection(body: Partial<Record<keyof DirectionDraft, unknown>>): TrainingDirection {
      const draft = parseDirection(body, null)
      const direction: TrainingDirection = { id: uid('dir'), ...draft, isArchived: false }
      state.directions.push(direction)
      return structuredClone(direction)
    },

    updateDirection(id: string, body: Partial<Record<keyof DirectionDraft | 'isArchived', unknown>>): TrainingDirection {
      const direction = findDirection(id)
      const draft = parseDirection(body, id)
      if (draft.kind !== direction.kind) {
        const programIds = new Set(state.programs.filter((p) => p.directionId === id).map((p) => p.id))
        if (state.tests.some((t) => programIds.has(t.programId))) conflict('По направлению уже есть тесты — вид направления менять нельзя')
      }
      Object.assign(direction, draft)
      if (typeof body.isArchived === 'boolean') direction.isArchived = body.isArchived
      return structuredClone(direction)
    },

    async createProgram(directionId: string, body: Partial<Record<keyof ProgramDraft, unknown>>): Promise<TrainingProgram> {
      const direction = findDirection(directionId)
      if (direction.isArchived) conflict('Направление в архиве')
      const draft = parseProgram(body, directionId, null)
      const program: TrainingProgram = { id: uid('pr'), directionId, ...draft, bitrixFolderId: '', storagePath: '', isArchived: false }
      await folderOf(program)
      state.programs.push(program)
      return structuredClone(program)
    },

    updateProgram(directionId: string, programId: string, body: Partial<Record<keyof ProgramDraft | 'isArchived', unknown>>): TrainingProgram {
      const program = findProgram(programId)
      if (program.directionId !== directionId) notFound('Программа не найдена')
      Object.assign(program, parseProgram(body, directionId, program))
      if (typeof body.isArchived === 'boolean') program.isArchived = body.isArchived
      return structuredClone(program)
    },

    listMaterials(filter: { programId?: string; q?: string }): TrainingMaterial[] {
      const q = filter.q?.toLocaleLowerCase('ru')
      return structuredClone(
        state.materials
          .filter((m) => !filter.programId || m.programIds.includes(filter.programId))
          .filter((m) => !q || `${m.title} ${m.fileName} ${m.description}`.toLocaleLowerCase('ru').includes(q))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      )
    },

    async createLinkMaterial(actor: Actor, body: Record<string, unknown>): Promise<TrainingMaterial> {
      const draft = { title: trimmed(body.title), programIds: strings(body.programIds), description: trimmed(body.description) }
      const error = validateMaterialDraft(draft)
      if (error) badRequest(error)
      draft.programIds.forEach(findProgram)
      const url = trimmed(body.url)
      if (!url) badRequest('Вставьте ссылку на файл в Битрикс')
      const file = await disk.resolveLink(url)
      const material: TrainingMaterial = {
        id: uid('mat'),
        ...draft,
        source: 'bitrix_link',
        bitrixFileId: file.fileId,
        storagePath: file.path,
        url: file.url || url,
        fileName: file.name,
        mimeType: file.mimeType,
        size: file.size,
        updatedAt: nowIso(),
        updatedBy: actor.fullName,
        isArchived: false,
        isUnavailable: false,
      }
      state.materials.unshift(material)
      return structuredClone(material)
    },

    async uploadMaterial(actor: Actor, meta: { title: string; programIds: string[]; description: string; fileName: string }, file: StoredFile): Promise<TrainingMaterial> {
      const error = validateMaterialDraft(meta)
      if (error) badRequest(error)
      const fileName = meta.fileName.replace(/[\\/:*?"<>|]+/g, '_')
      const mimeType = materialMimeType(fileName)
      if (!mimeType) badRequest('Допустимы PDF, DOCX, PPTX, XLSX, JPG, PNG и MP4')
      if (!file.data.length) badRequest('Файл пустой')
      if (file.data.length > MATERIAL_MAX_BYTES) badRequest('Файл больше 20 МБ — загрузите его прямо в Битрикс и добавьте ссылкой')
      const programs = meta.programIds.map(findProgram)
      const folder = await folderOf(programs[0])
      const uploaded = await disk.uploadFile(folder, fileName, { data: file.data, mimeType })
      const material: TrainingMaterial = {
        id: uid('mat'),
        title: meta.title,
        programIds: meta.programIds,
        description: meta.description,
        source: 'upload',
        bitrixFileId: uploaded.fileId,
        storagePath: uploaded.path,
        url: uploaded.url,
        fileName: uploaded.name,
        mimeType,
        size: file.data.length,
        updatedAt: nowIso(),
        updatedBy: actor.fullName,
        isArchived: false,
        isUnavailable: false,
      }
      state.materials.unshift(material)
      return structuredClone(material)
    },

    updateMaterial(actor: Actor, id: string, body: Record<string, unknown>): TrainingMaterial {
      const material = findMaterial(id)
      const draft = {
        title: 'title' in body ? trimmed(body.title) : material.title,
        programIds: 'programIds' in body ? strings(body.programIds) : material.programIds,
        description: 'description' in body ? trimmed(body.description) : material.description,
      }
      const error = validateMaterialDraft(draft)
      if (error) badRequest(error)
      draft.programIds.forEach(findProgram)
      Object.assign(material, draft, { updatedAt: nowIso(), updatedBy: actor.fullName })
      if (typeof body.isArchived === 'boolean') material.isArchived = body.isArchived
      return structuredClone(material)
    },

    /** Deletes the material record only; the file in Bitrix is never deleted by the ERP. */
    removeMaterial(id: string): void {
      findMaterial(id)
      const used = state.tests.find((t) => t.materialIds.includes(id))
      if (used) conflict(`Материал используется в тесте «${used.title}» — отправьте его в архив`)
      state.materials = state.materials.filter((m) => m.id !== id)
    },

    async materialFile(id: string): Promise<{ material: TrainingMaterial; file: StoredFile }> {
      const material = findMaterial(id)
      return { material: structuredClone(material), file: await fileOrUnavailable(material) }
    },

    listTests(filter: { programId?: string; status?: string; personnelKind?: string; group?: string; voltage?: string }): TestSummary[] {
      return state.tests
        .filter((t) => !filter.programId || t.programId === filter.programId)
        .filter((t) => !filter.status || t.status === filter.status)
        .filter((t) => !filter.personnelKind || t.electrical?.personnelKind === filter.personnelKind)
        .filter((t) => !filter.group || t.electrical?.group === filter.group)
        .filter((t) => !filter.voltage || t.electrical?.voltage === filter.voltage)
        .sort((a, b) => a.title.localeCompare(b.title, 'ru'))
        .map((t) => structuredClone(testSummary(t)))
    },

    getTest(id: string): TrainingTest {
      return structuredClone(findTest(id))
    },

    createTest(actor: Actor, body: Record<string, unknown>): TrainingTest {
      const content = parseContent(body)
      checkTestContent(content, false)
      const test: TrainingTest = { id: uid('test'), ...content, status: 'draft', version: 1, updatedAt: nowIso(), updatedBy: actor.fullName }
      state.tests.push(test)
      return structuredClone(test)
    },

    /** A draft changes freely; editing a published test creates a new version, issued links keep theirs. */
    updateTest(actor: Actor, id: string, body: Record<string, unknown>): TrainingTest {
      const test = findTest(id)
      if (test.status === 'archived') conflict('Тест в архиве — сначала опубликуйте его снова')
      const content = parseContent(body, contentOf(test))
      const isPublished = test.status === 'published'
      if (isPublished && content.programId !== test.programId) conflict('Программу опубликованного теста менять нельзя — создайте новый тест')
      checkTestContent(content, isPublished)
      Object.assign(test, content, { updatedAt: nowIso(), updatedBy: actor.fullName })
      if (isPublished) {
        test.version += 1
        state.versions[`${test.id}:${test.version}`] = structuredClone(content)
      }
      return structuredClone(test)
    },

    publishTest(actor: Actor, id: string): TrainingTest {
      const test = findTest(id)
      const content = contentOf(test)
      checkTestContent(content, true)
      test.status = 'published'
      test.updatedAt = nowIso()
      test.updatedBy = actor.fullName
      state.versions[`${test.id}:${test.version}`] = content
      return structuredClone(test)
    },

    archiveTest(actor: Actor, id: string): TrainingTest {
      const test = findTest(id)
      Object.assign(test, { status: 'archived', updatedAt: nowIso(), updatedBy: actor.fullName })
      return structuredClone(test)
    },

    removeTest(id: string): void {
      findTest(id)
      if (state.assignments.some((a) => a.testId === id)) conflict('По тесту уже были назначения — его можно только отправить в архив')
      state.tests = state.tests.filter((t) => t.id !== id)
      for (const key of Object.keys(state.versions)) if (key.startsWith(`${id}:`)) delete state.versions[key]
    },

    async uploadQuestionImage(testId: string, fileName: string, file: StoredFile): Promise<QuestionImage> {
      const test = findTest(testId)
      const clean = fileName.replace(/[\\/:*?"<>|]+/g, '_')
      if (!isImageFile(clean)) badRequest('Картинка должна быть в формате JPG или PNG')
      if (!file.data.length) badRequest('Файл пустой')
      if (file.data.length > IMAGE_MAX_BYTES) badRequest('Картинка больше 5 МБ')
      const mimeType = materialMimeType(clean) ?? 'image/png'
      const folder = await disk.ensureSubfolder(await folderOf(findProgram(test.programId)), TEST_IMAGES_FOLDER)
      const uploaded = await disk.uploadFile(folder, clean, { data: file.data, mimeType })
      freshImages.add(`${testId}:${uploaded.fileId}`)
      return { fileId: uploaded.fileId, fileName: uploaded.name, mimeType }
    },

    async testImage(testId: string, fileId: string): Promise<StoredFile> {
      const test = findTest(testId)
      const contents = [test, ...Object.entries(state.versions).filter(([k]) => k.startsWith(`${testId}:`)).map(([, v]) => v)]
      const isKnown = freshImages.has(`${testId}:${fileId}`) || contents.some((c) => c.questions.some((q) => q.image?.fileId === fileId))
      if (!isKnown) notFound('Картинка не найдена')
      return disk.getFile(fileId)
    },

    listAssignments(filter: { workerId?: string; testId?: string; programId?: string; status?: string; kind?: string }): AssignmentView[] {
      settleAll()
      const workers = workerMap()
      return state.assignments
        .filter((a) => a.testId)
        .filter((a) => !filter.workerId || a.workerId === filter.workerId)
        .filter((a) => !filter.testId || a.testId === filter.testId)
        .filter((a) => !filter.programId || a.programId === filter.programId)
        .filter((a) => !filter.kind || a.kind === filter.kind)
        .map((a) => view(a, workers))
        .filter((a) => !filter.status || (filter.status === 'active' ? isActiveAssignment(a, today()) : a.status === filter.status))
        .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))
    },

    createAssignments(actor: Actor, body: Record<string, unknown>, origin: string): AssignmentResult {
      const draft: TestAssignmentDraft = {
        testId: trimmed(body.testId),
        workerIds: strings(body.workerIds),
        dueDate: trimmed(body.dueDate),
        kind: body.kind === 'extraordinary' ? 'extraordinary' : body.kind === 'regular' ? 'regular' : (body.kind as never),
        reason: isExtraordinaryReason(body.reason) ? body.reason : null,
        reasonNote: trimmed(body.reasonNote),
      }
      const error = validateTestAssignmentDraft(draft, today())
      if (error) badRequest(error)
      if (draft.workerIds.length > 500) badRequest('Не больше 500 сотрудников за одно назначение')
      const test = findTest(draft.testId)
      if (test.status !== 'published') conflict('Назначать можно только опубликованный тест')
      const program = findProgram(test.programId)
      assertProgramUsable(program)
      const content = versionOf({ testId: test.id, testVersion: test.version })
      const workers = workerMap()
      const created: CreatedAssignment[] = []
      const skipped: SkippedWorker[] = []
      const skip = (workerId: string, reason: SkipReason, assignmentId: string | null = null) =>
        skipped.push({ workerId, workerName: workers.get(workerId)?.fullName ?? workerId, reason, label: SKIP_REASON_LABEL[reason], assignmentId })

      for (const workerId of draft.workerIds) {
        const worker = workers.get(workerId)
        if (!worker) {
          skip(workerId, 'not_found')
          continue
        }
        if (!canAssignWorker(worker.employment)) {
          skip(workerId, 'fired')
          continue
        }
        const active = state.assignments.filter((a) => a.workerId === workerId && a.programId === program.id && isActiveAssignment(a, today()))
        const blocking = draft.kind === 'regular' ? active[0] : active.find((a) => a.kind === 'extraordinary')
        if (blocking) {
          skip(workerId, 'active_exists', blocking.id)
          continue
        }
        for (const replaced of active) cancelRecord(replaced, 'Заменено внеочередной проверкой')
        const record: AssignmentRecord = {
          id: uid('ta'),
          testId: test.id,
          testVersion: test.version,
          programId: program.id,
          workerId,
          kind: draft.kind,
          reason: draft.kind === 'extraordinary' ? draft.reason : null,
          reasonNote: draft.kind === 'extraordinary' ? draft.reasonNote : '',
          assignedBy: actor.fullName,
          assignedById: actor.id,
          assignedAt: nowIso(),
          dueDate: draft.dueDate,
          status: 'assigned',
          attemptsUsed: 0,
          attemptsAllowed: content.attemptsPerAssignment,
          openedMaterialIds: [],
          finishedAt: null,
          cancelReason: '',
          tokenHash: '',
          tokenSecret: '',
          phoneFailures: 0,
          lockedUntil: 0,
        }
        const token = issueToken(record)
        state.assignments.push(record)
        created.push({ assignment: view(record, workers), ...linkView(record, origin, token, workers) })
      }

      if (created.length) {
        deps.audit?.record({
          userId: actor.id,
          userName: actor.fullName,
          action: draft.kind === 'extraordinary' ? 'training_assign_extraordinary' : 'training_assign',
          details: [
            `Тест «${test.title}» (версия ${test.version}), срок ${formatIsoDate(draft.dueDate)}, назначено: ${created.length}`,
            ...(draft.reason ? [`Причина: ${EXTRAORDINARY_REASON_LABEL[draft.reason]}. ${draft.reasonNote}`] : []),
          ].join('\n'),
        })
      }
      return { created, skipped, warnings: created.length ? requiredMaterialsWarning(content) : [] }
    },

    link(id: string, origin: string): LinkView {
      const record = findAssignment(id)
      settle(record)
      if (!isActiveAssignment(record, today()) || !record.tokenSecret) conflict('Назначение не активно — ссылка недоступна')
      return linkView(record, origin, decrypt(record.tokenSecret))
    },

    reissue(actor: Actor, id: string, origin: string): LinkView {
      const record = findAssignment(id)
      settle(record)
      if (!isActiveAssignment(record, today())) conflict('Назначение не активно — перевыпустить ссылку нельзя')
      const token = issueToken(record)
      deps.audit?.record({ userId: actor.id, userName: actor.fullName, action: 'training_link_reissue', details: `Назначение ${record.id}: ссылка перевыпущена` })
      return linkView(record, origin, token)
    },

    cancel(actor: Actor, id: string, reason: unknown): AssignmentView {
      const record = findAssignment(id)
      settle(record)
      if (!isActiveAssignment(record, today())) conflict('Назначение уже завершено')
      cancelRecord(record, trimmed(reason) || `Отозвано: ${actor.fullName}`)
      return view(record)
    },

    cancelForWorker(workerId: string, reason: string): number {
      const active = state.assignments.filter((a) => a.workerId === workerId && isActiveAssignment(a, today()))
      for (const record of active) cancelRecord(record, reason)
      return active.length
    },

    workerCertifications(workerId: string): WorkerCertifications {
      settleAll()
      const worker = workerMap().get(workerId) ?? notFound('Сотрудник не найден')
      const own = state.assignments.filter((a) => a.workerId === workerId)
      const ownIds = new Set(own.map((a) => a.id))
      return {
        statuses: statusesOf(worker),
        records: structuredClone(state.records.filter((r) => r.workerId === workerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
        assignments: own.filter((a) => a.testId).map((a) => view(a)).sort((a, b) => b.assignedAt.localeCompare(a.assignedAt)),
        attempts: state.attempts.filter((a) => ownIds.has(a.assignmentId)).map(summarizeAttempt).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      }
    },

    attempt(id: string): TestAttempt {
      return structuredClone(state.attempts.find((a) => a.id === id) ?? notFound('Попытка не найдена'))
    },

    annulRecord(actor: Actor, id: string, reason: unknown): CertificationRecord {
      const record = state.records.find((r) => r.id === id) ?? notFound('Результат не найден')
      if (record.isAnnulled) conflict('Результат уже аннулирован')
      const error = validateAnnulReason(reason)
      if (error) badRequest(error)
      Object.assign(record, { isAnnulled: true, annulReason: trimmed(reason), annulledBy: actor.fullName })
      const worker = workerMap().get(record.workerId)
      deps.audit?.record({
        userId: actor.id,
        userName: actor.fullName,
        action: 'training_record_annul',
        details: `${worker?.fullName ?? record.workerId}, ${labelOf(record.programId)} от ${formatIsoDate(record.passedAt)} (${record.percent} %). Причина: ${record.annulReason}`,
      })
      return structuredClone(record)
    },

    summary(): TrainingSummary {
      settleAll()
      const assignments = strippedAssignments()
      const rows = deps
        .workers()
        .filter((w) => w.employment !== 'fired')
        .map((w) => {
          const statuses = statusesOf(w, assignments)
          return {
            workerId: w.id,
            fullName: w.fullName,
            position: w.position,
            brigadeId: w.brigadeId,
            worst: worstProgramState(statuses.map((s) => s.state)),
            statuses,
          }
        })
      return { counters: trainingCounters(rows), rows }
    },

    // ─── Public API (by link) ───────────────────────────────────────────

    publicView(token: string, sessionToken: string | null): PublicTestView {
      const record = byToken(token)
      if (record.status === 'assigned' && assignmentStatus(record, today()) === 'assigned') record.status = 'opened'
      const content = versionOf(record)
      const worker = workerMap().get(record.workerId)
      return {
        status: assignmentStatus(record, today()),
        workerName: shortName(worker?.fullName ?? ''),
        programTitle: titleOf(record.programId),
        kind: record.kind,
        reasonLabel: record.reason ? EXTRAORDINARY_REASON_SHORT[record.reason as ExtraordinaryReason] : null,
        dueDate: record.dueDate,
        test: {
          title: content.title,
          description: content.description,
          questionCount: questionsPerAttempt(content),
          timeLimitMin: content.timeLimitMin,
          passPercent: content.passPercent,
          isMaterialsRequired: content.isMaterialsRequired,
          materialCount: content.materialIds.length,
        },
        attemptsAllowed: record.attemptsAllowed,
        attemptsUsed: record.attemptsUsed,
        isVerified: sessionOf(record, sessionToken),
        lockedUntil: record.lockedUntil > now() ? new Date(record.lockedUntil).toISOString() : null,
        hasActiveAttempt: Boolean(activeAttempt(record.id)),
        lastResult: publicResult(record),
      }
    },

    verify(token: string, value: unknown): { sessionToken: string; expiresAt: number } {
      const record = byToken(token)
      requireOpen(record)
      if (record.lockedUntil > now()) throw new HttpError(423, 'Слишком много попыток ввода, повторите через 30 минут')
      const worker = workerMap().get(record.workerId)
      const expected = phoneLast4(worker?.phone ?? '')
      if (expected.length < 4) conflict('В карточке сотрудника нет телефона — обратитесь к тому, кто прислал ссылку')
      const entered = typeof value === 'string' ? value.replace(/\D/g, '') : ''
      if (entered.length !== 4 || !sameHash(entered, expected)) {
        record.phoneFailures += 1
        if (record.phoneFailures >= PHONE_ATTEMPTS) {
          record.phoneFailures = 0
          record.lockedUntil = now() + PHONE_LOCK_MS
          throw new HttpError(423, 'Слишком много попыток ввода, повторите через 30 минут')
        }
        badRequest(`Цифры не совпадают. Осталось попыток: ${PHONE_ATTEMPTS - record.phoneFailures}`)
      }
      record.phoneFailures = 0
      if (record.status === 'assigned') record.status = 'opened'
      const sessionToken = randomBytes(24).toString('base64url')
      const expiresAt = now() + TEST_SESSION_MS
      for (const [id, session] of sessions) if (session.expiresAt < now()) sessions.delete(id)
      sessions.set(sessionToken, { assignmentId: record.id, tokenHash: record.tokenHash, expiresAt })
      return { sessionToken, expiresAt }
    },

    publicMaterials(token: string, sessionToken: string | null): PublicMaterial[] {
      const record = byToken(token)
      requireVerified(record, sessionToken)
      const content = versionOf(record)
      return content.materialIds.flatMap((id) => {
        const material = state.materials.find((m) => m.id === id)
        if (!material) return []
        return [
          {
            id: material.id,
            title: material.title,
            fileName: material.fileName,
            mimeType: material.mimeType,
            size: material.size,
            isOpened: record.openedMaterialIds.includes(id),
            isUnavailable: material.isUnavailable,
          },
        ]
      })
    },

    async publicMaterialFile(token: string, sessionToken: string | null, materialId: string): Promise<{ material: TrainingMaterial; file: StoredFile }> {
      const record = byToken(token)
      requireVerified(record, sessionToken)
      if (activeAttempt(record.id)) conflict('Во время теста материалы недоступны')
      if (!versionOf(record).materialIds.includes(materialId)) notFound('Материал не найден')
      const material = findMaterial(materialId)
      const file = await fileOrUnavailable(material)
      if (!record.openedMaterialIds.includes(materialId)) record.openedMaterialIds.push(materialId)
      return { material: structuredClone(material), file }
    },

    async publicImage(token: string, sessionToken: string | null, fileId: string): Promise<StoredFile> {
      const record = byToken(token)
      requireVerified(record, sessionToken)
      const attempts = state.attempts.filter((a) => a.assignmentId === record.id)
      if (!attempts.some((a) => a.questionSnapshot.some((q) => q.image?.fileId === fileId))) notFound('Картинка не найдена')
      return disk.getFile(fileId)
    },

    start(token: string, sessionToken: string | null, userAgent: string): PublicAttempt {
      const record = byToken(token)
      requireVerified(record, sessionToken)
      const current = activeAttempt(record.id)
      if (current) return publicAttempt(current)
      requireOpen(record)
      if (record.attemptsUsed >= record.attemptsAllowed) conflict('Попытки закончились')
      const content = versionOf(record)
      if (content.isMaterialsRequired && content.materialIds.some((id) => !record.openedMaterialIds.includes(id))) {
        conflict('Сначала откройте все материалы для подготовки')
      }
      const startedAt = now()
      const attempt: TestAttempt = {
        id: uid('att'),
        assignmentId: record.id,
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: null,
        deadlineAt: content.timeLimitMin ? new Date(startedAt + content.timeLimitMin * 60_000).toISOString() : null,
        questionSnapshot: drawQuestions(content, random),
        answers: [],
        score: 0,
        maxScore: 0,
        percent: 0,
        isPassed: false,
        finishReason: null,
        userAgent: userAgent.slice(0, 300),
      }
      state.attempts.push(attempt)
      record.attemptsUsed += 1
      record.status = 'in_progress'
      return publicAttempt(attempt)
    },

    answer(token: string, sessionToken: string | null, questionId: string, value: unknown): { questionId: string; optionIds: string[] } {
      const record = byToken(token)
      requireVerified(record, sessionToken)
      const attempt = activeAttempt(record.id)
      if (!attempt) {
        if (lastFinishedAttempt(record.id)?.finishReason === 'timeout') conflict('Время на тест истекло — ответы больше не принимаются')
        conflict('Тест не начат')
      }
      const question = attempt.questionSnapshot.find((q) => q.id === questionId) ?? notFound('Вопрос не найден')
      const optionIds = strings(value)
      if (optionIds.some((id) => !question.options.some((o) => o.id === id))) badRequest('Неизвестный вариант ответа')
      if (question.kind === 'single' && optionIds.length > 1) badRequest('В этом вопросе один правильный ответ')
      const answer = { questionId, optionIds, answeredAt: new Date(now()).toISOString() }
      attempt.answers = [...attempt.answers.filter((a) => a.questionId !== questionId), answer]
      return { questionId, optionIds }
    },

    finish(token: string, sessionToken: string | null): PublicResult {
      const record = byToken(token)
      requireVerified(record, sessionToken)
      const attempt = activeAttempt(record.id)
      if (attempt) finalize(record, attempt, 'submitted')
      return publicResult(record) ?? conflict('Тест не начат')
    },
  }

  return persisted(
    repository,
    [
      'createDirection',
      'updateDirection',
      'createProgram',
      'updateProgram',
      'createLinkMaterial',
      'uploadMaterial',
      'updateMaterial',
      'removeMaterial',
      'createTest',
      'updateTest',
      'publishTest',
      'archiveTest',
      'removeTest',
      'createAssignments',
      'reissue',
      'cancel',
      'cancelForWorker',
      'annulRecord',
      'publicView',
      'verify',
      'publicMaterialFile',
      'start',
      'answer',
      'finish',
    ],
    save,
  )
}

export type TrainingRepository = ReturnType<typeof createTrainingRepository>
