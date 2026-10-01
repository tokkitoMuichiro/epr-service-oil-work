import {
  TANK_CLEANING_QUALIFICATIONS,
  defaultExpiry,
  qualificationType,
  requiredForPosition,
  type Brigade,
  type BrigadeAssignment,
  type EmploymentStatus,
  type PositionRequirement,
  type QualificationTypeId,
  type WorkerDocument,
  type WorkerPii,
} from '../../shared.js'

export interface WorkerRecord {
  id: string
  fullName: string
  position: string
  phone: string
  hiredAt: string
  note: string
  employment: EmploymentStatus
  photoUpdatedAt: string | null
  documents: WorkerDocument[]
  pii: WorkerPii
}

export interface PersonnelSeed {
  workers: WorkerRecord[]
  brigades: Brigade[]
  assignments: BrigadeAssignment[]
  requirements: PositionRequirement[]
}

type DocSeed = [title: string, number: string, issuedAt: string, expiresAt: string]

const TITLE_QUALIFICATION: [RegExp, QualificationTypeId][] = [
  [/^Охрана труда/, 'labor_safety'],
  [/^Промышленная безопасность/, 'industrial'],
  [/^Работы на высоте/, 'height'],
  [/^Газоопасные/, 'gas'],
  [/замкнутых пространствах/, 'confined'],
]

function qualificationFields(title: string, number: string, issuedAt: string) {
  const typeId = TITLE_QUALIFICATION.find(([pattern]) => pattern.test(title))?.[1]
  if (!typeId) return {}
  const group = /(\d) группа/.exec(title)?.[1]
  return {
    qualificationTypeId: typeId,
    number,
    issuedAt,
    issuer: 'Учебный центр «Профессионал»',
    ...(group ? { group } : {}),
  }
}

export const DEFAULT_REQUIREMENTS: PositionRequirement[] = [
  { position: 'Бригадир', qualificationTypeIds: ['labor_safety'] },
  { position: 'Инженер ПТО', qualificationTypeIds: ['labor_safety'] },
  { position: 'Мастер', qualificationTypeIds: ['labor_safety', 'industrial'] },
  { position: 'Рабочий', qualificationTypeIds: ['labor_safety'] },
  { position: 'Сварщик', qualificationTypeIds: ['labor_safety', 'fire'] },
  { position: 'Слесарь-ремонтник', qualificationTypeIds: ['labor_safety', 'height'] },
]

/** Brigade «Юг» holds the full tank cleaning set so the demo has an assignable brigade. */
const FULLY_QUALIFIED = ['p-5', 'p-6', 'p-8', 'p-13', 'p-14']

function withTankPack(worker: WorkerRecord): WorkerRecord {
  if (!FULLY_QUALIFIED.includes(worker.id)) return worker
  const issuedAt = '2026-03-02'
  const needed = new Set([...TANK_CLEANING_QUALIFICATIONS, ...requiredForPosition(worker.position, DEFAULT_REQUIREMENTS)])
  const missing = [...needed].filter(
    (id) => !worker.documents.some((d) => d.qualificationTypeId === id && (d.expiresAt ?? '') > '2027-01-01'),
  )
  const pack = missing.map((typeId, i): WorkerDocument => {
    const name = qualificationType(typeId)?.name ?? typeId
    const number = `${worker.id.toUpperCase()}-${i + 1}`
    return {
      id: `${worker.id}-q-${typeId}`,
      title: `${name} № ${number}`,
      fileName: `${name} ${number}.txt`,
      mimeType: 'text/plain; charset=utf-8',
      size: 0,
      uploadedAt: `${issuedAt}T09:00:00.000Z`,
      expiresAt: defaultExpiry(typeId, issuedAt),
      qualificationTypeId: typeId,
      number,
      issuedAt,
      issuer: typeId === 'medical' ? 'Медцентр «Здоровье»' : 'Учебный центр «Профессионал»',
    }
  })
  return { ...worker, documents: [...pack, ...worker.documents] }
}

function worker(
  id: string,
  fullName: string,
  position: string,
  phone: string,
  hiredAt: string,
  pii: WorkerPii,
  docs: DocSeed[],
  note = '',
  employment: EmploymentStatus = 'active',
): WorkerRecord {
  return {
    id,
    fullName,
    position,
    phone,
    hiredAt,
    note,
    employment,
    photoUpdatedAt: null,
    pii,
    documents: docs.map(([title, number, issuedAt, expiresAt], i) => ({
      id: `${id}-doc-${i + 1}`,
      title: `${title} № ${number}`,
      fileName: `${title} ${number}.txt`.replace(/,/g, '').replace(/[\\/:*?"<>|]+/g, '_'),
      mimeType: 'text/plain; charset=utf-8',
      size: 0,
      uploadedAt: `${issuedAt}T09:00:00.000Z`,
      expiresAt,
      ...qualificationFields(title, number, issuedAt),
    })),
  }
}

function pad(value: number, length: number) {
  return String(value % 10 ** length).padStart(length, '0')
}

function staff(
  n: number,
  fullName: string,
  position: string,
  hiredAt: string,
  birthDate: string,
  docs: DocSeed[],
  employment: EmploymentStatus = 'active',
): WorkerRecord {
  return worker(
    `p-${n}`,
    fullName,
    position,
    `+7 912 000-11-${pad(n, 2)}`,
    hiredAt,
    {
      snils: `${pad(100 + n * 37, 3)}-${pad(200 + n * 53, 3)}-${pad(300 + n * 71, 3)} ${pad(n * 17, 2)}`,
      birthDate,
      passport: `65${pad(n, 2)} ${pad(400000 + n * 1373, 6)}`,
    },
    docs,
    '',
    employment,
  )
}

export function personnelSeed(): PersonnelSeed {
  const seed = demoPersonnel()
  return { ...seed, workers: seed.workers.map(withTankPack) }
}

function demoPersonnel(): PersonnelSeed {
  return {
    requirements: structuredClone(DEFAULT_REQUIREMENTS),
    workers: [
      worker(
        'p-1',
        'Козлов Андрей Викторович',
        'Мастер',
        '+7 912 000-11-01',
        '2019-04-15',
        { snils: '112-233-445 95', birthDate: '1984-02-11', passport: '6509 112233' },
        [
          ['Охрана труда (ИТР)', 'ОТ-2231', '2024-10-10', '2027-10-10'],
          ['Промышленная безопасность А1', 'ПБ-0917', '2023-11-01', '2026-10-15'],
        ],
      ),
      worker(
        'p-2',
        'Петров Сергей Николаевич',
        'Инженер ПТО',
        '+7 912 000-11-02',
        '2021-08-02',
        { snils: '223-344-556 01', birthDate: '1990-07-23', passport: '6512 445566' },
        [
          ['Охрана труда (ИТР)', 'ОТ-2232', '2024-10-10', '2027-10-10'],
          ['Промышленная безопасность Б2', 'ПБ-0412', '2023-06-01', '2026-06-01'],
        ],
        'Уволен по собственному желанию',
        'fired',
      ),
      worker(
        'p-3',
        'Сидоров Илья Павлович',
        'Слесарь-ремонтник',
        '+7 912 000-11-03',
        '2022-03-14',
        { snils: '334-455-667 12', birthDate: '1995-12-02', passport: '6515 778899' },
        [
          ['Работы на высоте, 2 группа', 'ВЫС-114', '2023-09-01', '2026-09-01'],
          ['Газоопасные работы', 'ГО-552', '2025-05-20', '2026-11-20'],
        ],
        'Допуск на высоту просрочен — направить на переаттестацию',
      ),
      worker(
        'p-4',
        'Козлова Анна Игоревна',
        'Рабочий',
        '+7 912 000-11-04',
        '2023-06-01',
        { snils: '998-877-665 43', birthDate: '1998-03-30', passport: '6518 102030' },
        [['Работа в замкнутых пространствах', 'ЗП-331', '2025-02-10', '2027-02-10']],
      ),
      worker(
        'p-5',
        'Морозов Денис Олегович',
        'Бригадир',
        '+7 912 000-11-05',
        '2018-01-22',
        { snils: '445-566-778 23', birthDate: '1982-09-14', passport: '6503 405060' },
        [
          ['Охрана труда (рабочие)', 'ОТ-3310', '2025-01-15', '2028-01-15'],
          ['Работы на высоте, 3 группа', 'ВЫС-208', '2024-10-20', '2026-10-20'],
        ],
      ),
      worker(
        'p-6',
        'Волков Никита Андреевич',
        'Рабочий',
        '+7 912 000-11-06',
        '2024-02-12',
        { snils: '556-677-889 34', birthDate: '2000-05-05', passport: '6520 708090' },
        [['Охрана труда (рабочие)', 'ОТ-3311', '2025-01-15', '2028-01-15']],
      ),
      worker(
        'p-7',
        'Смирнова Алина Владимировна',
        'Мастер',
        '+7 912 000-11-07',
        '2020-10-05',
        { snils: '667-788-990 45', birthDate: '1988-11-19', passport: '6510 112244' },
        [['Промышленная безопасность А1', 'ПБ-0918', '2025-03-01', '2028-03-01']],
        '',
        'vacation',
      ),
      worker(
        'p-8',
        'Лебедев Роман Игоревич',
        'Сварщик',
        '+7 912 000-11-08',
        '2021-05-17',
        { snils: '778-899-001 56', birthDate: '1993-01-27', passport: '6514 556677' },
        [['НАКС, аттестация сварщика', 'НАКС-7781', '2024-06-01', '2026-12-01']],
      ),
      staff(9, 'Никитин Павел Сергеевич', 'Бригадир', '2019-09-09', '1985-04-18', [
        ['Охрана труда (рабочие)', 'ОТ-3312', '2025-01-15', '2028-01-15'],
        ['Газоопасные работы', 'ГО-553', '2025-05-20', '2027-05-20'],
      ]),
      staff(10, 'Орлов Максим Александрович', 'Слесарь-ремонтник', '2022-11-01', '1996-08-02', [
        ['Работы на высоте, 2 группа', 'ВЫС-115', '2025-03-01', '2028-03-01'],
      ]),
      staff(11, 'Кузнецов Артём Дмитриевич', 'Рабочий', '2024-04-15', '2001-01-12', [
        ['Охрана труда (рабочие)', 'ОТ-3313', '2024-10-20', '2026-10-20'],
      ]),
      staff(12, 'Фёдоров Глеб Романович', 'Машинист насосных установок', '2021-07-19', '1991-10-30', [
        ['Машинист насосных установок', 'МНУ-044', '2024-02-01', '2027-02-01'],
      ]),
      staff(13, 'Соколов Егор Ильич', 'Рабочий', '2023-03-06', '1999-06-21', [
        ['Работа в замкнутых пространствах', 'ЗП-332', '2023-09-10', '2026-09-10'],
      ]),
      staff(14, 'Павлов Кирилл Евгеньевич', 'Маляр-пескоструйщик', '2022-05-23', '1994-12-09', [
        ['Охрана труда (рабочие)', 'ОТ-3314', '2025-01-15', '2028-01-15'],
      ]),
      staff(15, 'Григорьев Олег Васильевич', 'Мастер', '2016-02-01', '1979-03-03', [
        ['Охрана труда (ИТР)', 'ОТ-2233', '2024-10-10', '2027-10-10'],
        ['Промышленная безопасность А1', 'ПБ-0919', '2024-04-01', '2027-04-01'],
      ]),
      staff(16, 'Белова Марина Олеговна', 'Мастер', '2020-06-15', '1990-09-25', [
        ['Охрана труда (ИТР)', 'ОТ-2234', '2024-10-10', '2027-10-10'],
      ]),
      staff(17, 'Тарасов Виктор Геннадьевич', 'Бригадир', '2017-08-28', '1983-07-14', [
        ['Работы на высоте, 3 группа', 'ВЫС-209', '2025-06-01', '2028-06-01'],
      ]),
      staff(18, 'Васильев Денис Петрович', 'Сварщик', '2020-01-20', '1989-02-17', [
        ['НАКС, аттестация сварщика', 'НАКС-7782', '2024-10-01', '2026-10-25'],
      ]),
      staff(19, 'Зайцев Антон Игоревич', 'Рабочий', '2025-02-03', '2002-11-11', [
        ['Охрана труда (рабочие)', 'ОТ-3315', '2025-02-03', '2028-02-03'],
      ]),
      staff(20, 'Семёнов Руслан Маратович', 'Дефектоскопист', '2019-10-14', '1987-05-29', [
        ['Неразрушающий контроль, II уровень', 'НК-2210', '2024-03-15', '2027-03-15'],
      ]),
      staff(21, 'Голубев Степан Андреевич', 'Рабочий', '2024-08-12', '2000-03-08', [
        ['Работа в замкнутых пространствах', 'ЗП-333', '2025-04-01', '2027-04-01'],
      ]),
      staff(22, 'Виноградов Игорь Николаевич', 'Мастер', '2015-05-12', '1977-12-01', [
        ['Охрана труда (ИТР)', 'ОТ-2235', '2023-10-01', '2026-10-01'],
        ['Промышленная безопасность Б2', 'ПБ-0413', '2025-02-01', '2028-02-01'],
      ]),
      staff(23, 'Богданов Юрий Степанович', 'Бригадир', '2018-03-19', '1981-06-06', [
        ['Охрана труда (рабочие)', 'ОТ-3316', '2025-01-15', '2028-01-15'],
      ]),
      staff(24, 'Комаров Алексей Викторович', 'Бригадир', '2020-09-07', '1986-01-24', [
        ['Газоопасные работы', 'ГО-554', '2024-08-01', '2026-08-01'],
      ]),
      staff(25, 'Киселёв Даниил Олегович', 'Рабочий', '2023-11-13', '1998-04-04', [
        ['Охрана труда (рабочие)', 'ОТ-3317', '2024-11-13', '2027-11-13'],
      ]),
      staff(26, 'Ильин Тимур Рустамович', 'Сварщик', '2021-12-06', '1992-08-16', [
        ['НАКС, аттестация сварщика', 'НАКС-7783', '2025-01-10', '2027-01-10'],
      ]),
      staff(27, 'Медведев Василий Юрьевич', 'Маляр-пескоструйщик', '2022-07-25', '1995-10-10', [
        ['Охрана труда (рабочие)', 'ОТ-3318', '2025-01-15', '2028-01-15'],
      ]),
      staff(28, 'Ершова Ольга Сергеевна', 'Инженер ПТО', '2021-03-01', '1993-02-14', [
        ['Охрана труда (ИТР)', 'ОТ-2236', '2024-10-10', '2027-10-10'],
      ]),
      staff(
        29,
        'Николаев Георгий Павлович',
        'Водитель',
        '2019-06-17',
        '1984-09-09',
        [['Допуск к перевозке опасных грузов', 'ДОПОГ-118', '2024-10-15', '2026-10-15']],
        'vacation',
      ),
      staff(30, 'Макаров Илья Константинович', 'Рабочий', '2026-08-03', '2003-05-19', [
        ['Охрана труда (рабочие)', 'ОТ-3319', '2026-08-03', '2029-08-03'],
      ]),
    ],
    brigades: [
      {
        id: 'b-1',
        name: 'Бригада «Север»',
        masterIds: ['p-1'],
        foremanIds: ['p-3', 'p-9'],
        memberIds: ['p-1', 'p-3', 'p-9', 'p-4', 'p-10', 'p-11', 'p-12'],
      },
      {
        id: 'b-2',
        name: 'Бригада «Юг»',
        masterIds: [],
        foremanIds: ['p-5'],
        memberIds: ['p-5', 'p-6', 'p-8', 'p-13', 'p-14'],
      },
      {
        id: 'b-3',
        name: 'Бригада «Восток»',
        masterIds: ['p-15', 'p-16'],
        foremanIds: ['p-17'],
        memberIds: ['p-15', 'p-16', 'p-17', 'p-18', 'p-19', 'p-20', 'p-21'],
      },
      {
        id: 'b-4',
        name: 'Бригада «Запад»',
        masterIds: ['p-22'],
        foremanIds: ['p-23', 'p-24'],
        memberIds: ['p-22', 'p-23', 'p-24', 'p-25', 'p-26', 'p-27'],
      },
    ],
    assignments: [
      {
        id: 'a-1',
        brigadeId: 'b-1',
        contractId: 'c-2026-01',
        objectId: 'o-1',
        from: '2026-09-01',
        to: '2026-10-31',
        note: 'Дефектоскопия и АКЗ',
      },
      {
        id: 'a-2',
        brigadeId: 'b-2',
        contractId: 'c-2026-01',
        objectId: 'o-2',
        from: '2026-10-12',
        to: '2026-11-30',
        note: 'Зачистка резервуара',
      },
      {
        id: 'a-3',
        brigadeId: 'b-3',
        contractId: 'c-2026-04',
        objectId: 'o-12',
        from: '2026-09-07',
        to: '2026-11-30',
        note: 'Откачка и зачистка',
      },
      {
        id: 'a-4',
        brigadeId: 'b-4',
        contractId: 'c-2026-05',
        objectId: 'o-16',
        from: '2026-09-15',
        to: '2026-10-20',
        note: 'Дегазация и зачистка РГС',
      },
      {
        id: 'a-5',
        brigadeId: 'b-4',
        contractId: 'c-2026-05',
        objectId: 'o-17',
        from: '2026-11-01',
        to: '2027-01-31',
        note: '',
      },
      {
        id: 'a-6',
        brigadeId: 'b-3',
        contractId: 'c-2026-04',
        objectId: 'o-13',
        from: '2026-12-01',
        to: '2027-03-31',
        note: '',
      },
      {
        id: 'a-7',
        brigadeId: 'b-1',
        contractId: 'c-2026-03',
        objectId: 'o-5',
        from: '2026-11-16',
        to: '2027-02-28',
        note: 'Откачка и зачистка РВС-20000',
      },
    ],
  }
}
