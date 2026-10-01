import type {
  CertificationRecord,
  TestAssignment,
  TestAttempt,
  TestContent,
  TrainingDirection,
  TrainingMaterial,
  TrainingProgram,
  TrainingTest,
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

type ProgramEntry = [code: string, name: string, period: number, expiringDays?: number]

const CATALOG: { id: string; name: string; code: string; kind: TrainingDirection['kind']; programs: ProgramEntry[] }[] = [
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
