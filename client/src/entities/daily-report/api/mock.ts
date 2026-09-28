import type { DailyReport, DailyReportDraft, ReportObjectRef } from '../model/types'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Объекты из демо-контрактов ERP (те же id, что в contracts mock). */
const objectsSeed: ReportObjectRef[] = [
  {
    id: 'o-1',
    name: 'РВС-5000 №3',
    location: 'НПС «Северная»',
    contractId: 'c-2026-01',
    contractName: 'Договор №15/2026 — НПС Северная',
    customer: 'ООО «ТрансНефть-Сервис»',
  },
  {
    id: 'o-2',
    name: 'РВС-2000 №7',
    location: 'НПС «Северная»',
    contractId: 'c-2026-01',
    contractName: 'Договор №15/2026 — НПС Северная',
    customer: 'ООО «ТрансНефть-Сервис»',
  },
  {
    id: 'o-3',
    name: 'Резервуар РГС-100',
    location: 'НПС «Южная», площадка Б',
    contractId: 'c-2026-02',
    contractName: 'Договор №22/2026 — НПС Южная',
    customer: 'ПАО «НефтеПром»',
  },
]

function storagePath(objectId: string, date: string) {
  return `mock-disk/Ежедневные отчёты/${objectId}/${date}.txt`
}

let reportsSeed: DailyReport[] = [
  {
    id: 'r-1',
    objectId: 'o-1',
    date: '2026-09-26',
    authorName: 'Иванов П.С.',
    workStartFrom: '08:00',
    workStartTo: '08:30',
    estimatedCompletion: '2026-05-15',
    dronePeriods: [{ from: '14:00', to: '15:30' }],
    staffItr: '2 / Петров, Сидоров',
    staffForemen: '1 / Козлов',
    staffWorkers: '8 / бригада «Север»',
    workStage: 'Дефектоскопия днища, подготовка к АКЗ.',
    techMeans: 'Насос НЦ-80 зав.№4412; компрессор К-3 зав.№118.',
    volumes: 'Откачано 120 м³; зачищено 85 м².',
    workItems: [
      { itemId: 'w-2', name: 'Дефектоскопия днища', unit: 'м²', volume: 85 },
    ],
    ppe: 'Костюмы химзащитные — 8 шт., перчатки — 16 пар.',
    nextDay: 'Продолжение дефектоскопии, разметка зон АКЗ.',
    problems: '',
    createdAt: '2026-09-26T17:10:00.000Z',
    updatedAt: '2026-09-26T17:10:00.000Z',
    storagePath: storagePath('o-1', '2026-09-26'),
  },
  {
    id: 'r-2',
    objectId: 'o-1',
    date: '2026-09-27',
    authorName: 'Иванов П.С.',
    workStartFrom: '07:45',
    workStartTo: '08:15',
    estimatedCompletion: '2026-05-15',
    dronePeriods: [],
    staffItr: '2 / Петров, Сидоров',
    staffForemen: '1 / Козлов',
    staffWorkers: '8 / бригада «Север»',
    workStage: 'Дефектоскопия днища — завершение секторов А–В.',
    techMeans: 'Насос НЦ-80 зав.№4412; УЗК-комплект.',
    volumes: 'Проконтролировано 140 м².',
    workItems: [
      { itemId: 'w-2', name: 'Дефектоскопия днища', unit: 'м²', volume: 140 },
    ],
    ppe: 'Перчатки — 8 пар.',
    nextDay: 'Начало антикоррозионного покрытия (грунт).',
    problems: 'Задержка поставки грунта заказчиком (~1 сутки).',
    createdAt: '2026-09-27T16:40:00.000Z',
    updatedAt: '2026-09-27T16:40:00.000Z',
    storagePath: storagePath('o-1', '2026-09-27'),
  },
  {
    id: 'r-3',
    objectId: 'o-3',
    date: '2026-04-20',
    authorName: 'Смирнова А.В.',
    workStartFrom: '08:00',
    workStartTo: '08:20',
    estimatedCompletion: '2026-04-30',
    dronePeriods: [],
    staffItr: '1',
    staffForemen: '1',
    staffWorkers: '6',
    workStage: 'Комплексная зачистка — финальный проход.',
    techMeans: 'Мойка высокого давления зав.№22.',
    volumes: 'Зачищено 100%.',
    workItems: [
      { itemId: 'w-6', name: 'Комплексная зачистка', unit: '%', volume: 100 },
    ],
    ppe: '',
    nextDay: 'Сдача объекта заказчику.',
    problems: '',
    createdAt: '2026-04-20T15:00:00.000Z',
    updatedAt: '2026-04-20T15:00:00.000Z',
    storagePath: storagePath('o-3', '2026-04-20'),
  },
]

let failNext = false

export const dailyReportsApi = {
  async listObjects(query = ''): Promise<ReportObjectRef[]> {
    await delay(380)
    if (failNext) {
      failNext = false
      throw new Error('Не удалось загрузить объекты. Проверьте соединение.')
    }
    const q = query.trim().toLowerCase()
    const list = structuredClone(objectsSeed)
    if (!q) return list
    return list.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.location.toLowerCase().includes(q) ||
        o.contractName.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q),
    )
  },

  async listReports(objectId?: string): Promise<DailyReport[]> {
    await delay(320)
    const list = structuredClone(reportsSeed)
    if (!objectId) return list.sort((a, b) => b.date.localeCompare(a.date))
    return list
      .filter((r) => r.objectId === objectId)
      .sort((a, b) => b.date.localeCompare(a.date))
  },

  async listDates(objectId: string): Promise<string[]> {
    await delay(220)
    return [
      ...new Set(
        reportsSeed.filter((r) => r.objectId === objectId).map((r) => r.date),
      ),
    ].sort((a, b) => b.localeCompare(a))
  },

  async getByObjectAndDate(objectId: string, date: string): Promise<DailyReport | null> {
    await delay(240)
    const found = reportsSeed.find((r) => r.objectId === objectId && r.date === date)
    return found ? structuredClone(found) : null
  },

  async save(draft: DailyReportDraft): Promise<DailyReport> {
    await delay(420)
    const now = new Date().toISOString()
    const existingIdx = reportsSeed.findIndex(
      (r) => r.objectId === draft.objectId && r.date === draft.date,
    )
    const base: DailyReport = {
      id:
        existingIdx >= 0
          ? reportsSeed[existingIdx].id
          : `r-${crypto.randomUUID().slice(0, 8)}`,
      ...draft,
      dronePeriods: draft.dronePeriods.filter((p) => p.from || p.to),
      workItems: draft.workItems ?? [],
      createdAt: existingIdx >= 0 ? reportsSeed[existingIdx].createdAt : now,
      updatedAt: now,
      storagePath: storagePath(draft.objectId, draft.date),
    }
    if (existingIdx >= 0) reportsSeed[existingIdx] = structuredClone(base)
    else reportsSeed = [structuredClone(base), ...reportsSeed]
    return structuredClone(base)
  },

  simulateErrorOnce() {
    failNext = true
  },
}
