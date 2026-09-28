import type { Contract } from '../model/types'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

let seed: Contract[] = [
  {
    id: 'c-2026-01',
    name: 'Договор №15/2026 — НПС Северная',
    customer: 'ООО «ТрансНефть-Сервис»',
    year: 2026,
    objects: [
      {
        id: 'o-1',
        name: 'РВС-5000 №3',
        location: 'НПС «Северная»',
        plannedStart: '2026-03-01',
        plannedEnd: '2026-05-15',
        actualStart: '2026-03-03',
        works: [
          {
            id: 'w-1',
            title: 'Откачка и зачистка',
            plannedStart: '2026-03-01',
            plannedEnd: '2026-03-25',
            actualStart: '2026-03-03',
            actualEnd: '2026-03-28',
            status: 'done',
          },
          {
            id: 'w-2',
            title: 'Дефектоскопия днища',
            plannedStart: '2026-03-26',
            plannedEnd: '2026-04-10',
            actualStart: '2026-03-29',
            status: 'in_progress',
          },
          {
            id: 'w-3',
            title: 'Антикоррозионное покрытие',
            plannedStart: '2026-04-11',
            plannedEnd: '2026-05-15',
            status: 'planned',
          },
        ],
        deadlineEdits: [
          {
            id: 'e-1',
            field: 'plannedEnd',
            previousValue: '2026-05-01',
            newValue: '2026-05-15',
            editedAt: '2026-02-12T10:00:00.000Z',
            note: 'Сдвиг из-за поставки материалов заказчиком',
          },
        ],
      },
      {
        id: 'o-2',
        name: 'РВС-2000 №7',
        location: 'НПС «Северная»',
        plannedStart: '2026-06-01',
        plannedEnd: '2026-08-20',
        works: [
          {
            id: 'w-4',
            title: 'Подготовка площадки',
            plannedStart: '2026-06-01',
            plannedEnd: '2026-06-10',
            status: 'planned',
          },
          {
            id: 'w-5',
            title: 'Зачистка резервуара',
            plannedStart: '2026-06-11',
            plannedEnd: '2026-07-15',
            status: 'planned',
          },
        ],
        deadlineEdits: [],
      },
    ],
  },
  {
    id: 'c-2026-02',
    name: 'Договор №22/2026 — НПС Южная',
    customer: 'ПАО «НефтеПром»',
    year: 2026,
    objects: [
      {
        id: 'o-3',
        name: 'Резервуар РГС-100',
        location: 'НПС «Южная», площадка Б',
        plannedStart: '2026-04-01',
        plannedEnd: '2026-04-30',
        actualStart: '2026-04-01',
        actualEnd: '2026-04-22',
        works: [
          {
            id: 'w-6',
            title: 'Комплексная зачистка',
            plannedStart: '2026-04-01',
            plannedEnd: '2026-04-30',
            actualStart: '2026-04-01',
            actualEnd: '2026-04-22',
            status: 'done',
          },
        ],
        deadlineEdits: [],
      },
    ],
  },
  {
    id: 'c-2025-08',
    name: 'Договор №08/2025 — годовой сервис',
    customer: 'АО «ЭнергоРесурс»',
    year: 2025,
    objects: [],
  },
]

let failNext = false

export const contractsApi = {
  async list(): Promise<Contract[]> {
    await delay(450)
    if (failNext) {
      failNext = false
      throw new Error('Не удалось загрузить контракты. Проверьте соединение.')
    }
    return structuredClone(seed)
  },

  async saveAll(contracts: Contract[]): Promise<Contract[]> {
    await delay(280)
    seed = structuredClone(contracts)
    return structuredClone(seed)
  },

  /** Test helper: next list() call will reject once. */
  simulateErrorOnce() {
    failNext = true
  },

  resetSeed(next: Contract[]) {
    seed = structuredClone(next)
  },
}
