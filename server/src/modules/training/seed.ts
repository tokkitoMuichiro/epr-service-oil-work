import {
  nextDueDate,
  type CertificationRecord,
  type TestAssignment,
  type TestAttempt,
  type TestContent,
  type TestQuestion,
  type TrainingDirection,
  type TrainingMaterial,
  type TrainingProgram,
  type TrainingTest,
} from '../../shared.js'

export interface AssignmentRecord extends TestAssignment {
  /** SHA-256 of the link token: the public API looks assignments up by it. */
  tokenHash: string
  /** AES-GCM encrypted token, to show the same link again. */
  tokenSecret: string
  phoneFailures: number
  lockedUntil: number
}

export interface TrainingState {
  directions: TrainingDirection[]
  programs: TrainingProgram[]
  materials: TrainingMaterial[]
  tests: TrainingTest[]
  /** Published content by `${testId}:${version}`; assignments run on the version fixed at assignment. */
  versions: Record<string, TestContent>
  assignments: AssignmentRecord[]
  attempts: TestAttempt[]
  records: CertificationRecord[]
}

/** Demo files that exist only virtually in the mock Disk. */
export const SEED_FILE_PREFIX = 'seed-'

type ProgramSeed = [code: string, name: string, period: number, expiringDays?: number]

const CATALOG: { id: string; name: string; code: string; kind: TrainingDirection['kind']; programs: ProgramSeed[] }[] = [
  {
    id: 'dir-ot',
    name: 'Охрана труда',
    code: 'ОТ',
    kind: 'general',
    programs: [
      ['ОПП', 'Оказание первой помощи пострадавшим', 36],
      ['СИЗ', 'Использование (применение) средств индивидуальной защиты', 36],
      ['А', 'Общие вопросы охраны труда и функционирования СУОТ', 36],
      ['Б', 'Безопасные методы и приёмы выполнения работ при воздействии вредных и (или) опасных производственных факторов', 36],
      ['В', 'Безопасные методы и приёмы выполнения работ повышенной опасности', 36],
    ],
  },
  {
    id: 'dir-fire',
    name: 'Пожарная безопасность',
    code: 'ПБ',
    kind: 'general',
    programs: [['ПБ', 'Пожарная безопасность', 6, 14]],
  },
  {
    id: 'dir-el',
    name: 'Электробезопасность',
    code: 'ЭБ',
    kind: 'electrical',
    programs: [['ЭБ', 'Электробезопасность', 12]],
  },
  {
    id: 'dir-height',
    name: 'Работы на высоте',
    code: 'ВЫС',
    kind: 'general',
    programs: [
      ['Группа 1', 'Работы на высоте, группа 1', 60],
      ['Группа 2', 'Работы на высоте, группа 2', 60],
      ['Группа 3', 'Работы на высоте, группа 3', 60],
    ],
  },
  {
    id: 'dir-confined',
    name: 'Работы в замкнутом пространстве',
    code: 'ЗП',
    kind: 'general',
    programs: [['ЗП', 'Работы в замкнутых и ограниченных пространствах', 60]],
  },
]

const PROGRAM_IDS: Record<string, string> = {
  'dir-ot:ОПП': 'pr-ot-opp',
  'dir-ot:СИЗ': 'pr-ot-siz',
  'dir-ot:А': 'pr-ot-a',
  'dir-ot:Б': 'pr-ot-b',
  'dir-ot:В': 'pr-ot-v',
  'dir-fire:ПБ': 'pr-fire',
  'dir-el:ЭБ': 'pr-el',
  'dir-height:Группа 1': 'pr-height-1',
  'dir-height:Группа 2': 'pr-height-2',
  'dir-height:Группа 3': 'pr-height-3',
  'dir-confined:ЗП': 'pr-confined',
}

/** Starting catalogue (п. 3.1 ТЗ): reference data, created in every new database. Folders are created in Bitrix on first use. */
export function trainingCatalog(): Pick<TrainingState, 'directions' | 'programs'> {
  const directions: TrainingDirection[] = CATALOG.map((d, order) => ({
    id: d.id,
    name: d.name,
    code: d.code,
    kind: d.kind,
    order: order + 1,
    isArchived: false,
  }))
  const programs: TrainingProgram[] = CATALOG.flatMap((d) =>
    d.programs.map(([code, name, periodMonths, expiringDays = 30]) => ({
      id: PROGRAM_IDS[`${d.id}:${code}`],
      directionId: d.id,
      code,
      name,
      periodMonths,
      expiringDays,
      bitrixFolderId: '',
      storagePath: '',
      isArchived: false,
    })),
  )
  return { directions, programs }
}

export function emptyTraining(): TrainingState {
  return { ...trainingCatalog(), materials: [], tests: [], versions: {}, assignments: [], attempts: [], records: [] }
}

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

function material(id: string, title: string, programId: string, fileName: string, mimeType: string, size: number, source: TrainingMaterial['source'], path: string): TrainingMaterial {
  return {
    id,
    title,
    programIds: [programId],
    source,
    bitrixFileId: `${SEED_FILE_PREFIX}${id}`,
    storagePath: `mock-disk/Учебные материалы/${path}/${fileName}`,
    url: `https://bitrix.mock/disk/file/${SEED_FILE_PREFIX}${id}`,
    fileName,
    mimeType,
    size,
    description: '',
    updatedAt: SEED_TIME,
    updatedBy: SEED_AUTHOR,
    isArchived: false,
    isUnavailable: false,
  }
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
    phoneFailures: 0,
    lockedUntil: 0,
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

export function trainingSeed(): TrainingState {
  const materials = [
    material('mat-1', 'Инструкция по охране труда при зачистке резервуаров', 'pr-ot-b', 'Инструкция по ОТ при зачистке резервуаров.pdf', 'application/pdf', 248_000, 'upload', 'Охрана труда/Б'),
    material('mat-2', 'Видеоинструктаж: работа в изолирующем противогазе', 'pr-ot-b', 'Видеоинструктаж СИЗОД.mp4', 'video/mp4', 84_000_000, 'bitrix_link', 'Охрана труда/Б'),
    material('mat-3', 'Инструкция о мерах пожарной безопасности', 'pr-fire', 'Инструкция о мерах пожарной безопасности.pdf', 'application/pdf', 132_000, 'upload', 'Пожарная безопасность'),
  ]
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
    materials,
    tests: [test('test-ot-b', otB), test('test-fire', fire)],
    versions: { 'test-ot-b:1': structuredClone(otB), 'test-fire:1': structuredClone(fire) },
    ...demoHistory(),
    attempts: [],
  }
}
