import { MOCK_ROOT_ID, MOCK_URL, emptyMockDisk, type MockDisk } from '../../modules/training/bitrix.js'
import { trainingCatalog, type AssignmentRecord, type TrainingState } from '../../modules/training/model.js'
import { nextDueDate, type CertificationRecord, type TestAssignment, type TestContent, type TestQuestion, type TrainingMaterial, type TrainingTest } from '../../shared.js'

function q(id: string, text: string, options: string[], correct: number[], explanation: string, kind: TestQuestion['kind'] = 'single'): TestQuestion {
  return {
    id,
    text,
    kind,
    image: null,
    options: options.map((option, i) => ({ id: `${id}-${i + 1}`, text: option })),
    correctOptionIds: correct.map((i) => `${id}-${i + 1}`),
    explanation,
    weight: 1,
  }
}

const SEED_AUTHOR = 'Инженер ОТ (демо)'
const SEED_TIME = '2026-09-01T09:00:00.000Z'

interface DemoFile {
  id: string
  title: string
  programId: string
  fileName: string
  mimeType: string
  size: number
  source: TrainingMaterial['source']
  folder: string[]
}

const FILES: DemoFile[] = [
  {
    id: 'mat-1',
    title: 'Инструкция по охране труда при зачистке резервуаров',
    programId: 'pr-ot-b',
    fileName: 'Инструкция по ОТ при зачистке резервуаров.pdf',
    mimeType: 'application/pdf',
    size: 248_000,
    source: 'upload',
    folder: ['Охрана труда', 'Б'],
  },
  {
    id: 'mat-2',
    title: 'Видеоинструктаж: работа в изолирующем противогазе',
    programId: 'pr-ot-b',
    fileName: 'Видеоинструктаж СИЗОД.mp4',
    mimeType: 'video/mp4',
    size: 84_000_000,
    source: 'bitrix_link',
    folder: ['Охрана труда', 'Б'],
  },
  {
    id: 'mat-3',
    title: 'Инструкция о мерах пожарной безопасности',
    programId: 'pr-fire',
    fileName: 'Инструкция о мерах пожарной безопасности.pdf',
    mimeType: 'application/pdf',
    size: 132_000,
    source: 'upload',
    folder: ['Пожарная безопасность'],
  },
]

function fileId(file: DemoFile) {
  return `demo-${file.id}`
}

function material(file: DemoFile): TrainingMaterial {
  return {
    id: file.id,
    title: file.title,
    programIds: [file.programId],
    source: file.source,
    bitrixFileId: fileId(file),
    storagePath: `mock-disk/Учебные материалы/${file.folder.join('/')}/${file.fileName}`,
    url: `${MOCK_URL}${fileId(file)}`,
    fileName: file.fileName,
    mimeType: file.mimeType,
    size: file.size,
    description: '',
    updatedAt: SEED_TIME,
    updatedBy: SEED_AUTHOR,
    isArchived: false,
    isUnavailable: false,
  }
}

/** Mock Disk with the folders and file entries the demo materials point to. */
export function demoMockDisk(): MockDisk {
  const disk = emptyMockDisk()
  function folder(parentId: string, name: string): string {
    const existing = disk.folders.find((f) => f.parentId === parentId && f.name === name)
    if (existing) return existing.id
    disk.seq += 1
    const id = `mf${disk.seq}`
    disk.folders.push({ id, name, parentId })
    return id
  }
  for (const file of FILES) {
    const folderId = file.folder.reduce(folder, MOCK_ROOT_ID)
    disk.files.push({ id: fileId(file), name: file.fileName, folderId, size: file.size, mimeType: file.mimeType })
  }
  return disk
}

function test(id: string, content: TestContent): TrainingTest {
  return { id, ...content, status: 'published', version: 1, updatedAt: SEED_TIME, updatedBy: SEED_AUTHOR }
}

const OT_B_QUESTIONS: TestQuestion[] = [
  q('otb-1', 'Какой концентрации кислорода должно быть достаточно в резервуаре перед началом работ без изолирующих СИЗОД?', ['Не менее 18 % (об.)', 'Не менее 10 % (об.)', 'Любая, если есть вентиляция'], [0], 'Работы без изолирующих СИЗОД допускаются при содержании кислорода не менее 18 % (об.).'),
  q('otb-2', 'Кто выдаёт наряд-допуск на зачистку резервуара?', ['Сам исполнитель', 'Уполномоченный руководитель работ', 'Любой сотрудник бригады'], [1], 'Наряд-допуск выдаёт уполномоченный приказом руководитель.'),
  q('otb-3', 'Какие СИЗ обязательны при зачистке резервуара от нефтешлама?', ['Спецодежда и спецобувь', 'Изолирующий противогаз (СИЗОД)', 'Солнцезащитные очки', 'Страховочная привязь со спасательной верёвкой'], [0, 1, 3], 'Применяются спецодежда, СИЗОД и страховочная система для эвакуации.', 'multiple'),
  q('otb-4', 'Сколько человек минимум должно находиться снаружи у люка при работе одного рабочего внутри резервуара?', ['Никого', 'Один наблюдающий', 'Не менее двух наблюдающих'], [2], 'У люка находятся не менее двух наблюдающих, готовых к эвакуации пострадавшего.'),
  q('otb-5', 'Что делать при появлении запаха газа во время работы в резервуаре?', ['Продолжить работу в противогазе', 'Немедленно прекратить работу и покинуть резервуар', 'Открыть дополнительный люк и продолжить'], [1], 'Работы прекращаются, рабочие выводятся, выясняется причина.'),
]

const FIRE_QUESTIONS: TestQuestion[] = [
  q('fire-1', 'Каким огнетушителем нельзя тушить электрооборудование под напряжением?', ['Углекислотным', 'Порошковым', 'Водным (пенным)'], [2], 'Водные и пенные огнетушители проводят ток.'),
  q('fire-2', 'Какой первый порядок действий при обнаружении пожара?', ['Сообщить в пожарную охрану по 101 или 112', 'Собрать личные вещи', 'Открыть все окна'], [0], 'Первое действие — вызов пожарной охраны.'),
  q('fire-3', 'Где должны храниться промасленные обтирочные материалы?', ['В металлических ящиках с крышкой', 'В картонной коробке у рабочего места', 'В пластиковом пакете'], [0], 'Только в закрывающихся металлических ящиках.'),
  q('fire-4', 'Что требуется оформить перед огневыми работами на объекте?', ['Наряд-допуск на огневые работы', 'Ничего, если есть огнетушитель', 'Устное разрешение мастера'], [0], 'Огневые работы выполняются по наряду-допуску.'),
]

interface DemoResult {
  id: string
  workerId: string
  programId: string
  kind: TestAssignment['kind']
  isPassed: boolean
  percent: number
  passedAt: string
  periodMonths: number
  reason?: TestAssignment['reason']
  reasonNote?: string
  electrical?: CertificationRecord['electrical']
}

const DEMO_RESULTS: DemoResult[] = [
  { id: 'd1', workerId: 'p-1', programId: 'pr-ot-a', kind: 'regular', isPassed: true, percent: 90, passedAt: '2025-03-12', periodMonths: 36 },
  { id: 'd2', workerId: 'p-1', programId: 'pr-fire', kind: 'regular', isPassed: true, percent: 85, passedAt: '2026-04-15', periodMonths: 6 },
  { id: 'd3', workerId: 'p-3', programId: 'pr-ot-b', kind: 'regular', isPassed: true, percent: 80, passedAt: '2024-06-10', periodMonths: 36 },
  {
    id: 'd4',
    workerId: 'p-3',
    programId: 'pr-ot-b',
    kind: 'extraordinary',
    isPassed: false,
    percent: 65,
    passedAt: '2026-09-20',
    periodMonths: 36,
    reason: 'regulation_change',
    reasonNote: 'Новые правила по охране труда при зачистке резервуаров',
  },
  { id: 'd5', workerId: 'p-3', programId: 'pr-height-1', kind: 'regular', isPassed: true, percent: 100, passedAt: '2023-09-01', periodMonths: 60 },
  {
    id: 'd6',
    workerId: 'p-5',
    programId: 'pr-el',
    kind: 'regular',
    isPassed: true,
    percent: 95,
    passedAt: '2026-02-01',
    periodMonths: 12,
    electrical: { personnelKind: 'electrotechnical', group: 'III', voltage: 'up_to_1000' },
  },
  { id: 'd7', workerId: 'p-6', programId: 'pr-fire', kind: 'regular', isPassed: true, percent: 75, passedAt: '2026-01-20', periodMonths: 6 },
]

function demoHistory(): Pick<TrainingState, 'assignments' | 'records'> {
  const assignments: AssignmentRecord[] = DEMO_RESULTS.map((r) => ({
    id: `as-${r.id}`,
    testId: '',
    testVersion: 1,
    programId: r.programId,
    workerId: r.workerId,
    kind: r.kind,
    reason: r.reason ?? null,
    reasonNote: r.reasonNote ?? '',
    assignedBy: SEED_AUTHOR,
    assignedById: '',
    assignedAt: `${r.passedAt}T08:00:00.000Z`,
    dueDate: r.passedAt,
    status: r.isPassed ? 'passed' : 'failed',
    attemptsUsed: 1,
    attemptsAllowed: 1,
    openedMaterialIds: [],
    finishedAt: `${r.passedAt}T10:00:00.000Z`,
    cancelReason: '',
    tokenHash: '',
    tokenSecret: '',
  }))
  const records: CertificationRecord[] = DEMO_RESULTS.map((r) => ({
    id: `rec-${r.id}`,
    workerId: r.workerId,
    programId: r.programId,
    assignmentId: `as-${r.id}`,
    attemptId: null,
    kind: r.kind,
    reason: r.reason ?? null,
    isPassed: r.isPassed,
    percent: r.percent,
    passedAt: r.passedAt,
    createdAt: `${r.passedAt}T10:00:00.000Z`,
    nextDueAt: r.isPassed ? nextDueDate(r.passedAt, r.periodMonths) : null,
    electrical: r.electrical ?? null,
    isAnnulled: false,
    annulReason: '',
    annulledBy: '',
  }))
  return { assignments, records }
}

export function demoTraining(): TrainingState {
  const otB: TestContent = {
    title: 'Программа Б — для слесарей по зачистке резервуаров',
    programId: 'pr-ot-b',
    electrical: null,
    description: 'Прочитайте инструкцию и посмотрите видеоинструктаж. В тесте 5 вопросов, нужно ответить правильно на 80 %.',
    materialIds: ['mat-1', 'mat-2'],
    isMaterialsRequired: true,
    questions: OT_B_QUESTIONS,
    questionsPerAttempt: null,
    passPercent: 80,
    timeLimitMin: 20,
    attemptsPerAssignment: 2,
    isShuffled: true,
    isAnswersShown: true,
  }
  const fire: TestContent = {
    title: 'Пожарная безопасность — общий тест',
    programId: 'pr-fire',
    electrical: null,
    description: 'Ответьте на вопросы о мерах пожарной безопасности на объекте.',
    materialIds: ['mat-3'],
    isMaterialsRequired: false,
    questions: FIRE_QUESTIONS,
    questionsPerAttempt: null,
    passPercent: 75,
    timeLimitMin: null,
    attemptsPerAssignment: 2,
    isShuffled: true,
    isAnswersShown: true,
  }
  return {
    ...trainingCatalog(),
    materials: FILES.map(material),
    tests: [test('test-ot-b', otB), test('test-fire', fire)],
    versions: { 'test-ot-b:1': structuredClone(otB), 'test-fire:1': structuredClone(fire) },
    ...demoHistory(),
    attempts: [],
  }
}
