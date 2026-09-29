import cors from 'cors'
import express from 'express'

const app = express()
const port = Number(process.env.PORT) || 4568

app.use(cors())
app.use(express.json())

/** In-memory demo store aligned with contract object ids. */
const reportObjects = [
  {
    id: 'o-1',
    name: 'РВС-5000 №3',
    location: 'НПС «Северная»',
    contractId: 'c-2026-01',
    contractName: 'Договор №15/2026 — НПС Северная',
  },
  {
    id: 'o-2',
    name: 'РВС-2000 №7',
    location: 'НПС «Северная»',
    contractId: 'c-2026-01',
    contractName: 'Договор №15/2026 — НПС Северная',
  },
  {
    id: 'o-3',
    name: 'Резервуар РГС-100',
    location: 'НПС «Южная», площадка Б',
    contractId: 'c-2026-02',
    contractName: 'Договор №22/2026 — НПС Южная',
  },
]

type ReportRecord = {
  id: string
  objectId: string
  date: string
  authorName: string
  payload: Record<string, unknown>
  storagePath: string
  updatedAt: string
}

const reports: ReportRecord[] = []

const equipmentCatalog = {
  warehouses: [
    { id: 'wh-repair', name: 'Ремонт', slug: 'repair', isSystem: true },
    { id: 'wh-north', name: 'База Север', slug: 'demo-north', isSystem: false },
    { id: 'wh-south', name: 'База Юг', slug: 'demo-south', isSystem: false },
  ],
  people: [
    { id: 'u-admin', fullName: 'Админ Тестов', roleSlug: 'admin' },
    { id: 'u-master-ivanov', fullName: 'Мастер Иванов', roleSlug: 'master' },
    { id: 'u-master-sidorov', fullName: 'Мастер Сидоров', roleSlug: 'master' },
    { id: 'u-keeper', fullName: 'Кладовщик Складской', roleSlug: 'keeper' },
  ],
  items: [
    {
      id: 'eq-1',
      name: 'Насос центробежный НЦ-80',
      factoryNumber: 'NC-80-4412',
      type: 'SERIAL',
      condition: 'OK',
      ownerType: 'USER',
      ownerUserId: 'u-master-ivanov',
    },
    {
      id: 'eq-3',
      name: 'Рукав напорный',
      quantity: 24,
      type: 'CONSUMABLE',
      condition: 'OK',
      ownerType: 'WAREHOUSE',
      ownerWarehouseId: 'wh-north',
    },
    {
      id: 'eq-4',
      name: 'Шлифмашина угловая',
      factoryNumber: 'AG-125-77',
      type: 'SERIAL',
      condition: 'IN_REPAIR',
      ownerType: 'WAREHOUSE',
      ownerWarehouseId: 'wh-repair',
    },
  ],
  transfers: [
    {
      id: 'tr-pending-1',
      equipmentName: 'Генератор 5 кВт',
      status: 'PENDING',
      fromLabel: 'Мастер Сидоров',
      toLabel: 'Мастер Иванов',
    },
  ],
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'erp-ammir-api',
    time: new Date().toISOString(),
  })
})

app.get('/api', (_req, res) => {
  res.json({
    name: 'ERP АММИР API',
    version: '0.3.0',
    endpoints: [
      '/health',
      '/api/reports/objects',
      '/api/reports',
      '/api/reports/:objectId/dates',
      '/api/reports/:objectId/:date',
      '/api/equipment',
      '/api/equipment/warehouses',
      '/api/equipment/transfers',
    ],
    bitrix: 'mock',
  })
})

app.get('/api/reports/objects', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase()
  const items = q
    ? reportObjects.filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          o.location.toLowerCase().includes(q) ||
          o.contractName.toLowerCase().includes(q),
      )
    : reportObjects
  res.json({ items, mockMode: true })
})

app.get('/api/reports', (req, res) => {
  const objectId = String(req.query.objectId || '').trim()
  const items = objectId ? reports.filter((r) => r.objectId === objectId) : reports
  res.json({
    items: items.sort((a, b) => b.date.localeCompare(a.date)),
    mockMode: true,
  })
})

app.get('/api/reports/:objectId/dates', (req, res) => {
  const objectId = String(req.params.objectId)
  const dates = [
    ...new Set(reports.filter((r) => r.objectId === objectId).map((r) => r.date)),
  ].sort((a, b) => b.localeCompare(a))
  res.json({ objectId, dates, mockMode: true })
})

app.get('/api/reports/:objectId/:date', (req, res) => {
  const { objectId, date } = req.params
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Дата должна быть в формате YYYY-MM-DD' })
  }
  const report = reports.find((r) => r.objectId === objectId && r.date === date)
  if (!report) return res.status(404).json({ error: 'Отчёта за эту дату нет' })
  res.json({ report, mockMode: true })
})

app.post('/api/reports', (req, res) => {
  const body = req.body || {}
  const objectId = String(body.objectId || '').trim()
  const date = String(body.date || '').trim()
  if (!objectId) return res.status(400).json({ error: 'Выберите объект' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Некорректная дата' })
  }
  const object = reportObjects.find((o) => o.id === objectId)
  if (!object) return res.status(404).json({ error: 'Объект не найден' })

  const now = new Date().toISOString()
  const storagePath = `mock-disk/Ежедневные отчёты/${objectId}/${date}.txt`
  const existing = reports.findIndex((r) => r.objectId === objectId && r.date === date)
  const record: ReportRecord = {
    id: existing >= 0 ? reports[existing].id : `api-${Date.now()}`,
    objectId,
    date,
    authorName: String(body.authorName || '').trim(),
    payload: body,
    storagePath,
    updatedAt: now,
  }
  if (existing >= 0) reports[existing] = record
  else reports.unshift(record)

  res.json({
    ok: true,
    report: record,
    object,
    mockMode: true,
  })
})

app.get('/api/equipment', (_req, res) => {
  res.json({
    items: equipmentCatalog.items,
    people: equipmentCatalog.people,
    mockMode: true,
    note: 'Клиент ведёт полный demo-store в Pinia; этот stub — контракт API.',
  })
})

app.get('/api/equipment/warehouses', (_req, res) => {
  res.json({ items: equipmentCatalog.warehouses, mockMode: true })
})

app.get('/api/equipment/transfers', (_req, res) => {
  res.json({ items: equipmentCatalog.transfers, mockMode: true })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`API listening on http://0.0.0.0:${port}`)
})
