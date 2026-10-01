import { addMonthsIso, daysBetweenIso, formatIsoDate, isIsoDate } from './dates.js'
import type { EmploymentStatus } from './personnel.js'

export const TRAINING_ROOT_FOLDER = 'Учебные материалы'
export const TEST_IMAGES_FOLDER = 'Изображения к тестам'
export const DEFAULT_TRAINING_EXPIRING_DAYS = 30
export const DEFAULT_PASS_PERCENT = 80
export const DEFAULT_ATTEMPTS = 2
export const DEFAULT_DUE_DAYS = 7
export const MATERIAL_MAX_BYTES = 20 * 1024 * 1024
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const REASON_NOTE_MIN = 5
export const ANNUL_REASON_MIN = 5
/** Answers arriving later than the deadline plus this grace period are rejected. */
export const ANSWER_GRACE_MS = 30_000
export const PHONE_ATTEMPTS = 5
export const PHONE_LOCK_MS = 30 * 60 * 1000
export const TEST_SESSION_MS = 4 * 60 * 60 * 1000

// ─── Directions and programmes ────────────────────────────────────────────

export type DirectionKind = 'general' | 'electrical'

export const DIRECTION_KIND_LABEL: Record<DirectionKind, string> = {
  general: 'Общее',
  electrical: 'Электробезопасность (группы и напряжение)',
}

export interface TrainingDirection {
  id: string
  name: string
  code: string
  kind: DirectionKind
  order: number
  isArchived: boolean
}

export interface TrainingProgram {
  id: string
  directionId: string
  code: string
  name: string
  periodMonths: number
  expiringDays: number
  bitrixFolderId: string
  storagePath: string
  isArchived: boolean
}

export interface DirectionDraft {
  name: string
  code: string
  kind: DirectionKind
  order: number
}

export interface ProgramDraft {
  code: string
  name: string
  periodMonths: number
  expiringDays: number
}

export interface DirectionWithPrograms extends TrainingDirection {
  programs: TrainingProgram[]
}

export function isDirectionKind(value: unknown): value is DirectionKind {
  return value === 'general' || value === 'electrical'
}

export function validateDirectionDraft(draft: Partial<DirectionDraft>, others: TrainingDirection[]): string | null {
  const name = draft.name?.trim() ?? ''
  if (!name) return 'Укажите название направления'
  if (!draft.code?.trim()) return 'Укажите код направления'
  if (!isDirectionKind(draft.kind)) return 'Выберите вид направления'
  const key = name.toLocaleLowerCase('ru')
  if (others.some((d) => d.name.trim().toLocaleLowerCase('ru') === key)) return `Направление «${name}» уже есть`
  return null
}

export function validateProgramDraft(draft: Partial<ProgramDraft>, siblings: TrainingProgram[]): string | null {
  const code = draft.code?.trim() ?? ''
  if (!code) return 'Укажите код программы'
  if (!draft.name?.trim()) return 'Укажите название программы'
  const period = draft.periodMonths
  if (!Number.isInteger(period) || (period as number) < 1 || (period as number) > 60) {
    return 'Периодичность — от 1 до 60 месяцев'
  }
  const expiring = draft.expiringDays
  if (!Number.isInteger(expiring) || (expiring as number) < 0 || (expiring as number) > 180) {
    return 'Предупреждение об истечении — от 0 до 180 дней'
  }
  const key = code.toLocaleLowerCase('ru')
  if (siblings.some((p) => p.code.trim().toLocaleLowerCase('ru') === key)) {
    return `Программа с кодом «${code}» уже есть в направлении`
  }
  return null
}

/** Short label: «ОТ — Б», «ВЫС — Группа 2»; a single programme with the direction code — just «ПБ». */
export function programLabel(program: Pick<TrainingProgram, 'code'>, direction: Pick<TrainingDirection, 'code'> | null | undefined): string {
  if (!direction) return program.code
  return program.code === direction.code ? direction.code : `${direction.code} — ${program.code}`
}

/** Full title for the worker: «Охрана труда — Б», «Пожарная безопасность». */
export function programTitle(program: Pick<TrainingProgram, 'code'>, direction: Pick<TrainingDirection, 'code' | 'name'> | null | undefined): string {
  if (!direction) return program.code
  return program.code === direction.code ? direction.name : `${direction.name} — ${program.code}`
}

// ─── Electrical safety scope ──────────────────────────────────────────────

export type ElectricalPersonnelKind = 'electrotechnical' | 'electrotechnological' | 'non_electrical'
export type ElectricalGroup = 'I' | 'II' | 'III' | 'IV' | 'V'
export type ElectricalVoltage = 'up_to_1000' | 'above_1000'

export interface ElectricalScope {
  personnelKind: ElectricalPersonnelKind
  group: ElectricalGroup
  voltage: ElectricalVoltage | null
}

export const PERSONNEL_KIND_LABEL: Record<ElectricalPersonnelKind, string> = {
  electrotechnical: 'электротехнический',
  electrotechnological: 'электротехнологический',
  non_electrical: 'неэлектротехнический',
}

export const ELECTRICAL_GROUPS: ElectricalGroup[] = ['I', 'II', 'III', 'IV', 'V']

export const VOLTAGE_LABEL: Record<ElectricalVoltage, string> = {
  up_to_1000: 'до 1000 В',
  above_1000: 'выше 1000 В',
}

export function validateElectricalScope(scope: Partial<ElectricalScope> | null | undefined): string | null {
  if (!scope) return 'Для теста по электробезопасности укажите вид персонала, группу и напряжение'
  if (!scope.personnelKind || !(scope.personnelKind in PERSONNEL_KIND_LABEL)) return 'Укажите вид персонала'
  if (!scope.group || !ELECTRICAL_GROUPS.includes(scope.group)) return 'Укажите группу по электробезопасности'
  if (scope.personnelKind === 'non_electrical' && scope.group !== 'I') {
    return 'Неэлектротехническому персоналу присваивается только I группа'
  }
  if (scope.personnelKind !== 'non_electrical' && scope.group === 'I') {
    return 'Электротехническому и электротехнологическому персоналу присваиваются группы II–V'
  }
  if (scope.group === 'I') return scope.voltage ? 'Для I группы напряжение не указывается' : null
  if (!scope.voltage || !(scope.voltage in VOLTAGE_LABEL)) return 'Для групп II–V укажите напряжение'
  return null
}

export function describeElectricalScope(scope: ElectricalScope): string {
  return [`${scope.group} гр.`, scope.voltage ? VOLTAGE_LABEL[scope.voltage] : null, PERSONNEL_KIND_LABEL[scope.personnelKind]]
    .filter(Boolean)
    .join(', ')
}

export function matchesElectricalFilter(scope: ElectricalScope | null, filter: Partial<ElectricalScope>): boolean {
  if (!scope) return false
  if (filter.personnelKind && scope.personnelKind !== filter.personnelKind) return false
  if (filter.group && scope.group !== filter.group) return false
  if (filter.voltage && scope.voltage !== filter.voltage) return false
  return true
}

// ─── Materials ────────────────────────────────────────────────────────────

export type MaterialSource = 'upload' | 'bitrix_link'

export interface TrainingMaterial {
  id: string
  title: string
  programIds: string[]
  source: MaterialSource
  bitrixFileId: string
  storagePath: string
  url: string
  fileName: string
  mimeType: string
  size: number
  description: string
  updatedAt: string
  updatedBy: string
  isArchived: boolean
  /** The file was removed from Bitrix Disk. */
  isUnavailable: boolean
}

export interface MaterialDraft {
  title: string
  programIds: string[]
  description: string
}

export const MATERIAL_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  mp4: 'video/mp4',
}

export const MATERIAL_ACCEPT = Object.keys(MATERIAL_TYPES)
  .map((ext) => `.${ext}`)
  .join(',')

export function fileExtension(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim())
  return match ? match[1].toLowerCase() : ''
}

/** MIME type of an allowed training file by its extension; null for other files. */
export function materialMimeType(fileName: string): string | null {
  return MATERIAL_TYPES[fileExtension(fileName)] ?? null
}

export function isImageFile(fileName: string): boolean {
  return (materialMimeType(fileName) ?? '').startsWith('image/')
}

export function validateMaterialDraft(draft: Partial<MaterialDraft>): string | null {
  if (!draft.title?.trim()) return 'Укажите название материала'
  if (!Array.isArray(draft.programIds) || !draft.programIds.length) return 'Выберите хотя бы одну программу'
  return null
}

export function isInsideTrainingRoot(storagePath: string): boolean {
  const parts = storagePath.split('/').map((p) => p.trim()).filter(Boolean)
  return parts.includes(TRAINING_ROOT_FOLDER) && parts[parts.length - 1] !== TRAINING_ROOT_FOLDER
}

export const OUTSIDE_ROOT_ERROR = `Файл должен лежать в папке «${TRAINING_ROOT_FOLDER}»`

// ─── Tests ────────────────────────────────────────────────────────────────

export type QuestionKind = 'single' | 'multiple'

export const QUESTION_KIND_LABEL: Record<QuestionKind, string> = {
  single: 'Один ответ',
  multiple: 'Несколько ответов',
}

export interface TestOption {
  id: string
  text: string
}

export interface QuestionImage {
  fileId: string
  fileName: string
  mimeType: string
}

export interface TestQuestion {
  id: string
  text: string
  kind: QuestionKind
  image: QuestionImage | null
  options: TestOption[]
  correctOptionIds: string[]
  explanation: string
  weight: number
}

export type TestStatus = 'draft' | 'published' | 'archived'

export const TEST_STATUS_LABEL: Record<TestStatus, string> = {
  draft: 'Черновик',
  published: 'Опубликован',
  archived: 'В архиве',
}

export interface TestContent {
  title: string
  programId: string
  electrical: ElectricalScope | null
  description: string
  materialIds: string[]
  isMaterialsRequired: boolean
  questions: TestQuestion[]
  /** null — every question of the bank. */
  questionsPerAttempt: number | null
  passPercent: number
  timeLimitMin: number | null
  attemptsPerAssignment: number
  isShuffled: boolean
  isAnswersShown: boolean
}

export interface TrainingTest extends TestContent {
  id: string
  status: TestStatus
  version: number
  updatedAt: string
  updatedBy: string
}

export interface TestSummary extends Omit<TrainingTest, 'questions'> {
  questionCount: number
}

export function emptyTestContent(programId = ''): TestContent {
  return {
    title: '',
    programId,
    electrical: null,
    description: '',
    materialIds: [],
    isMaterialsRequired: false,
    questions: [],
    questionsPerAttempt: null,
    passPercent: DEFAULT_PASS_PERCENT,
    timeLimitMin: null,
    attemptsPerAssignment: DEFAULT_ATTEMPTS,
    isShuffled: true,
    isAnswersShown: true,
  }
}

export function testSummary(test: TrainingTest): TestSummary {
  const { questions, ...rest } = test
  return { ...rest, questionCount: questions.length }
}

export function questionsPerAttempt(test: Pick<TestContent, 'questions' | 'questionsPerAttempt'>): number {
  return Math.min(test.questionsPerAttempt ?? test.questions.length, test.questions.length)
}

function validateQuestion(question: TestQuestion, index: number, forPublish: boolean): string | null {
  const at = `Вопрос ${index + 1}`
  if (question.kind !== 'single' && question.kind !== 'multiple') return `${at}: неизвестный тип вопроса`
  if (!Array.isArray(question.options) || question.options.length > 8) return `${at}: не больше 8 вариантов ответа`
  if (!(question.weight > 0) || question.weight > 100) return `${at}: балл — больше 0 и не больше 100`
  const optionIds = new Set(question.options.map((o) => o.id))
  if (question.correctOptionIds.some((id) => !optionIds.has(id))) return `${at}: правильный ответ не из списка вариантов`
  if (!forPublish) return null
  if (!question.text.trim()) return `${at}: введите текст вопроса`
  if (question.options.length < 2) return `${at}: нужно от 2 до 8 вариантов ответа`
  if (question.options.some((o) => !o.text.trim())) return `${at}: заполните текст всех вариантов`
  const texts = question.options.map((o) => o.text.trim().toLocaleLowerCase('ru'))
  if (new Set(texts).size !== texts.length) return `${at}: варианты ответа повторяются`
  if (!question.correctOptionIds.length) return `${at}: отметьте правильный ответ`
  if (question.kind === 'single' && question.correctOptionIds.length !== 1) return `${at}: должен быть ровно один правильный ответ`
  return null
}

/**
 * Draft checks keep the structure sane; `forPublish` adds the publishing rules (п. 5.5 ТЗ):
 * questions exist, every question is complete, the bank covers `questionsPerAttempt`, the electrical scope is valid.
 */
export function validateTestDraft(
  content: TestContent,
  options: { kind: DirectionKind; forPublish?: boolean },
): string | null {
  const forPublish = Boolean(options.forPublish)
  if (!content.title.trim()) return 'Укажите название теста'
  if (!content.programId) return 'Выберите программу'
  if (!Number.isInteger(content.passPercent) || content.passPercent < 50 || content.passPercent > 100) {
    return 'Порог сдачи — от 50 до 100 %'
  }
  if (!Number.isInteger(content.attemptsPerAssignment) || content.attemptsPerAssignment < 1 || content.attemptsPerAssignment > 5) {
    return 'Попыток на назначение — от 1 до 5'
  }
  if (content.timeLimitMin !== null && (!Number.isInteger(content.timeLimitMin) || content.timeLimitMin < 1 || content.timeLimitMin > 240)) {
    return 'Лимит времени — от 1 до 240 минут'
  }
  if (content.questionsPerAttempt !== null && (!Number.isInteger(content.questionsPerAttempt) || content.questionsPerAttempt < 1)) {
    return 'Число вопросов в попытке — не меньше 1'
  }
  if (options.kind === 'general' && content.electrical) return 'Параметры электробезопасности указываются только для тестов ЭБ'
  if (options.kind === 'electrical' && (forPublish || content.electrical)) {
    const error = validateElectricalScope(content.electrical)
    if (error) return error
  }
  const ids = new Set<string>()
  for (const [index, question] of content.questions.entries()) {
    if (ids.has(question.id)) return `Вопрос ${index + 1}: повторяющийся идентификатор`
    ids.add(question.id)
    const error = validateQuestion(question, index, forPublish)
    if (error) return error
  }
  if (!forPublish) return null
  if (!content.questions.length) return 'Добавьте хотя бы один вопрос'
  if (content.questionsPerAttempt !== null && content.questionsPerAttempt > content.questions.length) {
    return `В банке ${content.questions.length} вопр., а в попытке нужно ${content.questionsPerAttempt}`
  }
  return null
}

// ─── Assignments ──────────────────────────────────────────────────────────

export type AssignmentKind = 'regular' | 'extraordinary'

export const ASSIGNMENT_KIND_LABEL: Record<AssignmentKind, string> = {
  regular: 'Очередная',
  extraordinary: 'Внеочередная',
}

export type ExtraordinaryReason =
  | 'regulation_change'
  | 'new_equipment'
  | 'job_change'
  | 'incident'
  | 'work_break'
  | 'authority_demand'
  | 'other'

export const EXTRAORDINARY_REASON_LABEL: Record<ExtraordinaryReason, string> = {
  regulation_change: 'Введение новых или изменение нормативных правовых актов, инструкций',
  new_equipment: 'Ввод нового оборудования, изменение технологических процессов',
  job_change: 'Перевод на другую работу, изменение должностных обязанностей',
  incident: 'Несчастный случай, авария, инцидент, нарушение требований',
  work_break: 'Перерыв в работе более 6 месяцев',
  authority_demand: 'Требование руководителя, заказчика или контролирующего органа',
  other: 'Прочее',
}

export const EXTRAORDINARY_REASON_SHORT: Record<ExtraordinaryReason, string> = {
  regulation_change: 'изменение НПА',
  new_equipment: 'новое оборудование',
  job_change: 'перевод на другую работу',
  incident: 'инцидент',
  work_break: 'перерыв в работе',
  authority_demand: 'требование руководителя или надзора',
  other: 'прочее',
}

export function isExtraordinaryReason(value: unknown): value is ExtraordinaryReason {
  return typeof value === 'string' && value in EXTRAORDINARY_REASON_LABEL
}

export type AssignmentStatus = 'assigned' | 'opened' | 'in_progress' | 'passed' | 'failed' | 'expired' | 'cancelled'

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  assigned: 'Назначено',
  opened: 'Ссылка открыта',
  in_progress: 'Проходит',
  passed: 'Сдано',
  failed: 'Не сдано',
  expired: 'Срок истёк',
  cancelled: 'Отозвано',
}

export const ACTIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = ['assigned', 'opened', 'in_progress']

export interface TestAssignment {
  id: string
  testId: string
  testVersion: number
  programId: string
  workerId: string
  kind: AssignmentKind
  reason: ExtraordinaryReason | null
  reasonNote: string
  assignedBy: string
  assignedById: string
  assignedAt: string
  dueDate: string
  status: AssignmentStatus
  attemptsUsed: number
  attemptsAllowed: number
  openedMaterialIds: string[]
  finishedAt: string | null
  cancelReason: string
}

export interface TestAssignmentDraft {
  testId: string
  workerIds: string[]
  dueDate: string
  kind: AssignmentKind
  reason: ExtraordinaryReason | null
  reasonNote: string
}

export type SkipReason = 'fired' | 'not_found' | 'active_exists'

export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  fired: 'Сотрудник уволен',
  not_found: 'Сотрудник не найден',
  active_exists: 'Уже есть активное назначение по этой программе',
}

/** Stored status with the date-based expiry applied (no background job needed). */
export function assignmentStatus(assignment: Pick<TestAssignment, 'status' | 'dueDate'>, today: string): AssignmentStatus {
  if ((assignment.status === 'assigned' || assignment.status === 'opened') && assignment.dueDate < today) return 'expired'
  return assignment.status
}

export function isActiveAssignment(assignment: Pick<TestAssignment, 'status' | 'dueDate'>, today: string): boolean {
  return ACTIVE_ASSIGNMENT_STATUSES.includes(assignmentStatus(assignment, today))
}

export function canAssignWorker(employment: EmploymentStatus): boolean {
  return employment === 'active' || employment === 'vacation'
}

export function validateTestAssignmentDraft(draft: Partial<TestAssignmentDraft>, today: string): string | null {
  if (!draft.testId) return 'Выберите тест'
  if (!Array.isArray(draft.workerIds) || !draft.workerIds.length) return 'Выберите сотрудников'
  if (!isIsoDate(draft.dueDate)) return 'Укажите срок прохождения'
  if (draft.dueDate < today) return 'Срок прохождения уже прошёл'
  if (draft.kind !== 'regular' && draft.kind !== 'extraordinary') return 'Выберите тип проверки'
  if (draft.kind === 'extraordinary') {
    if (!isExtraordinaryReason(draft.reason)) return 'Для внеочередной проверки укажите причину'
    if ((draft.reasonNote?.trim().length ?? 0) < REASON_NOTE_MIN) {
      return `Опишите причину внеочередной проверки (не короче ${REASON_NOTE_MIN} символов)`
    }
  }
  return null
}

export function assignmentMessage(input: { fullName: string; programName: string; dueDate: string; link: string }): string {
  const [last, first] = input.fullName.split(/\s+/)
  const name = [last, first].filter(Boolean).join(' ')
  return `${name}, пройдите проверку знаний «${input.programName}» до ${formatIsoDate(input.dueDate)}: ${input.link}. Для входа понадобятся последние 4 цифры вашего телефона.`
}

/** «Иванов И. И.» — the only personal data shown on the public test page. */
export function shortName(fullName: string): string {
  const [last, ...rest] = fullName.trim().split(/\s+/)
  const initials = rest.map((p) => `${p.charAt(0).toUpperCase()}.`).join(' ')
  return [last, initials].filter(Boolean).join(' ')
}

export function phoneLast4(phone: string): string {
  return phone.replace(/\D/g, '').slice(-4)
}

// ─── Attempts and scoring ─────────────────────────────────────────────────

export type FinishReason = 'submitted' | 'timeout' | 'cancelled'

export interface AttemptAnswer {
  questionId: string
  optionIds: string[]
  answeredAt: string
}

export interface TestAttempt {
  id: string
  assignmentId: string
  startedAt: string
  finishedAt: string | null
  deadlineAt: string | null
  /** Questions as issued (order and options); the result does not change when the test is edited. */
  questionSnapshot: TestQuestion[]
  answers: AttemptAnswer[]
  score: number
  maxScore: number
  percent: number
  isPassed: boolean
  finishReason: FinishReason | null
  userAgent: string
}

/** A question as the worker sees it: correct answers and explanations never leave the server before the finish. */
export interface PublicQuestion {
  id: string
  text: string
  kind: QuestionKind
  image: QuestionImage | null
  options: TestOption[]
}

export function toPublicQuestion(question: TestQuestion): PublicQuestion {
  return {
    id: question.id,
    text: question.text,
    kind: question.kind,
    image: question.image,
    options: question.options.map((o) => ({ id: o.id, text: o.text })),
  }
}

export interface AttemptScore {
  score: number
  maxScore: number
  percent: number
  isPassed: boolean
}

function sameSet(a: string[], b: string[]): boolean {
  const left = new Set(a)
  return left.size === new Set(b).size && b.every((id) => left.has(id))
}

export function isAnswerCorrect(question: Pick<TestQuestion, 'kind' | 'correctOptionIds'>, optionIds: string[]): boolean {
  if (!optionIds.length) return false
  if (question.kind === 'single') return optionIds.length === 1 && question.correctOptionIds[0] === optionIds[0]
  return sameSet(optionIds, question.correctOptionIds)
}

/** single — the correct option; multiple — exactly the correct set, no partial credit; unanswered — 0. */
export function scoreAttempt(
  questions: Pick<TestQuestion, 'id' | 'kind' | 'correctOptionIds' | 'weight'>[],
  answers: Pick<AttemptAnswer, 'questionId' | 'optionIds'>[],
  passPercent: number,
): AttemptScore {
  const byQuestion = new Map(answers.map((a) => [a.questionId, a.optionIds]))
  let score = 0
  let maxScore = 0
  for (const question of questions) {
    maxScore += question.weight
    if (isAnswerCorrect(question, byQuestion.get(question.id) ?? [])) score += question.weight
  }
  const percent = maxScore ? Math.round((score / maxScore) * 100) : 0
  return { score, maxScore, percent, isPassed: percent >= passPercent }
}

/** Fisher–Yates with an injectable random source (tests pass a deterministic one). */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** The question set of a new attempt: a sample of the bank, shuffled with options when the test asks for it. */
export function drawQuestions(
  test: Pick<TestContent, 'questions' | 'questionsPerAttempt' | 'isShuffled'>,
  random: () => number = Math.random,
): TestQuestion[] {
  const count = questionsPerAttempt(test)
  if (!test.isShuffled) return structuredClone(test.questions.slice(0, count))
  return shuffled(test.questions, random)
    .slice(0, count)
    .map((q) => ({ ...structuredClone(q), options: shuffled(q.options, random) }))
}

export function unansweredCount(questionIds: string[], answers: Pick<AttemptAnswer, 'questionId' | 'optionIds'>[]): number {
  const answered = new Set(answers.filter((a) => a.optionIds.length).map((a) => a.questionId))
  return questionIds.filter((id) => !answered.has(id)).length
}

// ─── Certification records and programme state ────────────────────────────

export interface CertificationRecord {
  id: string
  workerId: string
  programId: string
  assignmentId: string
  attemptId: string | null
  kind: AssignmentKind
  reason: ExtraordinaryReason | null
  isPassed: boolean
  percent: number
  /** Completion date. */
  passedAt: string
  createdAt: string
  nextDueAt: string | null
  electrical: ElectricalScope | null
  isAnnulled: boolean
  annulReason: string
  annulledBy: string
}

export function nextDueDate(passedAt: string, periodMonths: number): string {
  return addMonthsIso(passedAt, periodMonths)
}

/** State by results only; `failed` — no pass yet, or a failed extraordinary check after the last pass. */
export type ResultState = 'valid' | 'expiring' | 'expired' | 'failed'

/** An active assignment overrides the result: the check is in progress. */
export type ProgramState = ResultState | 'assigned'

export const PROGRAM_STATE_LABEL: Record<ProgramState, string> = {
  valid: 'Сдана',
  expiring: 'Истекает',
  expired: 'Просрочена',
  failed: 'Не сдана',
  assigned: 'Назначена',
}

/** A worker without any assignments or results. */
export const NOT_ASSIGNED_LABEL = 'Не назначена'

const PROGRAM_STATE_RANK: Record<ProgramState, number> = {
  valid: 0,
  assigned: 1,
  expiring: 2,
  expired: 3,
  failed: 4,
}

export function isProgramProblem(state: ProgramState | null): boolean {
  return state === 'expiring' || state === 'expired' || state === 'failed'
}

export interface ProgramStatus {
  programId: string
  state: ProgramState
  result: ResultState | null
  lastRecord: CertificationRecord | null
  /** The latest passed result: it defines the next due date and the electrical group. */
  validRecord: CertificationRecord | null
  nextDueAt: string | null
  activeAssignment: TestAssignment | null
}

function lastIndexOf<T>(items: T[], match: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i -= 1) if (match(items[i])) return i
  return -1
}

function byCompletion(a: CertificationRecord, b: CertificationRecord): number {
  return a.passedAt.localeCompare(b.passedAt) || a.createdAt.localeCompare(b.createdAt)
}

/**
 * Programme state of one worker (п. 5.3 ТЗ). A failed regular check keeps the previous result valid;
 * a failed extraordinary check overrides it until a later pass. Annulled records are ignored.
 * null — the programme was never assigned to the worker.
 */
export function programState(
  program: Pick<TrainingProgram, 'id' | 'expiringDays'>,
  records: CertificationRecord[],
  assignments: TestAssignment[],
  today: string,
): ProgramStatus | null {
  const own = records.filter((r) => r.programId === program.id && !r.isAnnulled).sort(byCompletion)
  const lastPassedIndex = lastIndexOf(own, (r) => r.isPassed)
  const lastFailedExtraIndex = lastIndexOf(own, (r) => !r.isPassed && r.kind === 'extraordinary')
  const validRecord = lastPassedIndex >= 0 ? own[lastPassedIndex] : null
  const activeAssignment =
    assignments
      .filter((a) => a.programId === program.id && isActiveAssignment(a, today))
      .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))[0] ?? null
  if (!own.length && !activeAssignment) return null

  let result: ResultState | null = null
  if (lastFailedExtraIndex > lastPassedIndex || (own.length && !validRecord)) result = 'failed'
  else if (validRecord?.nextDueAt) {
    const left = daysBetweenIso(today, validRecord.nextDueAt)
    result = left < 0 ? 'expired' : left <= program.expiringDays ? 'expiring' : 'valid'
  }

  return {
    programId: program.id,
    state: activeAssignment ? 'assigned' : (result ?? 'failed'),
    result,
    lastRecord: own[own.length - 1] ?? null,
    validRecord,
    nextDueAt: result === 'failed' ? null : (validRecord?.nextDueAt ?? null),
    activeAssignment,
  }
}

export function worstProgramState(states: (ProgramState | null)[]): ProgramState | null {
  return states.reduce<ProgramState | null>((worst, s) => {
    if (!s) return worst
    if (!worst) return s
    return PROGRAM_STATE_RANK[s] > PROGRAM_STATE_RANK[worst] ? s : worst
  }, null)
}

/** Only programmes that were assigned to the worker: with results or an active assignment. */
export function workerProgramStatuses(
  worker: { id: string },
  programs: TrainingProgram[],
  records: CertificationRecord[],
  assignments: TestAssignment[],
  today: string,
): ProgramStatus[] {
  const ownRecords = records.filter((r) => r.workerId === worker.id)
  const ownAssignments = assignments.filter((a) => a.workerId === worker.id)
  return programs.flatMap((program) => programState(program, ownRecords, ownAssignments, today) ?? [])
}

/** Per worker × programme, except `notAssigned` — workers without any training. */
export interface TrainingCounters {
  valid: number
  expiring: number
  expired: number
  failed: number
  assigned: number
  notAssigned: number
}

export function trainingCounters(rows: { statuses: ProgramStatus[] }[]): TrainingCounters {
  const statuses = rows.flatMap((r) => r.statuses)
  const count = (state: ProgramState) => statuses.filter((s) => s.state === state).length
  return {
    valid: count('valid'),
    expiring: count('expiring'),
    expired: count('expired'),
    failed: count('failed'),
    assigned: count('assigned'),
    notAssigned: rows.filter((r) => !r.statuses.length).length,
  }
}

export function validateAnnulReason(reason: unknown): string | null {
  if (typeof reason !== 'string' || reason.trim().length < ANNUL_REASON_MIN) {
    return `Укажите причину аннулирования (не короче ${ANNUL_REASON_MIN} символов)`
  }
  return null
}

// ─── API views ────────────────────────────────────────────────────────────

export interface StorageCheck {
  mode: 'mock' | 'live'
  rootName: string
  rootPath: string
}

export interface AssignmentView extends TestAssignment {
  workerName: string
  workerPhone: string
  testTitle: string
  programLabel: string
}

export interface CreatedAssignment {
  assignment: AssignmentView
  link: string
  message: string
}

export interface SkippedWorker {
  workerId: string
  workerName: string
  reason: SkipReason
  label: string
  assignmentId: string | null
}

export interface AssignmentResult {
  created: CreatedAssignment[]
  skipped: SkippedWorker[]
  warnings: string[]
}

export interface LinkView {
  link: string
  message: string
}

export interface AttemptSummary {
  id: string
  assignmentId: string
  startedAt: string
  finishedAt: string | null
  score: number
  maxScore: number
  percent: number
  isPassed: boolean
  finishReason: FinishReason | null
}

export interface WorkerCertifications {
  statuses: ProgramStatus[]
  records: CertificationRecord[]
  assignments: AssignmentView[]
  attempts: AttemptSummary[]
}

export interface SummaryRow {
  workerId: string
  fullName: string
  position: string
  brigadeId: string | null
  worst: ProgramState | null
  statuses: ProgramStatus[]
}

export interface TrainingSummary {
  counters: TrainingCounters
  rows: SummaryRow[]
}

export interface ReviewItem {
  questionId: string
  text: string
  image: QuestionImage | null
  options: TestOption[]
  chosenIds: string[]
  /** Disclosed only when the assignment is over, so a retry cannot be passed by memorising answers. */
  correctIds: string[] | null
  isCorrect: boolean
  explanation: string
}

export interface PublicResult {
  score: number
  maxScore: number
  percent: number
  isPassed: boolean
  passPercent: number
  attemptsLeft: number
  nextDueAt: string | null
  finishReason: FinishReason | null
  review: ReviewItem[] | null
}

export interface PublicAttempt {
  id: string
  questions: PublicQuestion[]
  answers: { questionId: string; optionIds: string[] }[]
  deadlineAt: string | null
  serverNow: string
}

export interface PublicTestView {
  status: AssignmentStatus
  workerName: string
  programTitle: string
  kind: AssignmentKind
  reasonLabel: string | null
  dueDate: string
  test: {
    title: string
    description: string
    questionCount: number
    timeLimitMin: number | null
    passPercent: number
    isMaterialsRequired: boolean
    materialCount: number
  }
  attemptsAllowed: number
  attemptsUsed: number
  isVerified: boolean
  lockedUntil: string | null
  hasActiveAttempt: boolean
  lastResult: PublicResult | null
}

export interface PublicMaterial {
  id: string
  title: string
  fileName: string
  mimeType: string
  size: number
  isOpened: boolean
  isUnavailable: boolean
}