import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { createApp, type AppOptions } from './app.js'
import { openDatabase } from './db.js'
import { ensurePath } from './disk/disk.js'
import { createLiveDisk } from './disk/live.js'
import { createMockDisk, type MockDisk } from './disk/mock.js'
import {
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  FAKE_PORTAL,
  FAKE_WEBHOOK,
  createFakeBitrix,
} from './testing/fake-bitrix.js'
import { demoUserOf } from './modules/auth/repository.js'
import { demoSeed } from './testing/fixtures/index.js'
import { unzip } from './testing/unzip.js'
import {
  validateBrigadeDraft,
  type AssignmentIssue,
  type Brigade,
  type BrigadeAssignment,
  type Contract,
  type DailyReport,
  type EquipmentState,
  type ObjectCrew,
  type ReportDay,
  type RoleId,
  type User,
  type Worker,
} from './shared.js'

const TODAY = '2026-09-29'
const DEMO_ADMIN = demoUserOf('admin').id
const DEMO_MASTER = demoUserOf('master').id
const DEMO_KEEPER = demoUserOf('storekeeper').id

interface CallResult {
  status: number
  headers: Headers
  text: string
  json: any
}

type Who = RoleId | { cookie: string } | null

function sessionCookie(response: Response): string {
  const header = response.headers.get('set-cookie') ?? ''
  const match = /erp_session=[^;]+/.exec(header)
  assert.ok(match, 'session cookie is set')
  return match[0]
}

async function startApp(options: AppOptions = {}) {
  const server: Server = createApp({ today: () => TODAY, devLogin: true, seed: demoSeed, ...options }).listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const cookies = new Map<RoleId, string>()

  async function cookieOf(who: Who): Promise<string | null> {
    if (who === null) return null
    if (typeof who === 'object') return who.cookie
    const cached = cookies.get(who)
    if (cached) return cached
    const response = await fetch(`${base}/api/auth/dev-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: who }),
    })
    assert.equal(response.status, 200, `dev login as ${who}`)
    const cookie = sessionCookie(response)
    cookies.set(who, cookie)
    return cookie
  }

  async function raw(method: string, url: string, who: Who, init: { headers?: Record<string, string>; body?: BodyInit } = {}) {
    const cookie = await cookieOf(who)
    return fetch(`${base}${url}`, {
      method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...init.headers },
      body: init.body,
    })
  }

  async function call(method: string, url: string, who: Who = 'admin', body?: unknown, headers: Record<string, string> = {}): Promise<CallResult> {
    const response = await raw(method, url, who, {
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    const isJson = response.headers.get('content-type')?.includes('application/json')
    return { status: response.status, headers: response.headers, text, json: isJson ? JSON.parse(text) : null }
  }

  async function download(url: string, who: Who = 'admin') {
    const response = await raw('GET', url, who)
    return { status: response.status, headers: response.headers, data: Buffer.from(await response.arrayBuffer()) }
  }

  function upload(url: string, method: string, body: string, who: Who = 'admin') {
    return raw(method, url, who, { headers: { 'Content-Type': 'application/octet-stream' }, body })
  }

  async function close() {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
  }

  return { base, call, download, upload, close }
}

type Api = Awaited<ReturnType<typeof startApp>>

let api: Api
let call: Api['call']
let download: Api['download']
let upload: Api['upload']

before(async () => {
  api = await startApp()
  call = api.call
  download = api.download
  upload = api.upload
})

after(async () => {
  await api.close()
})

describe('api', () => {
  it('reports health and unknown API routes', async () => {
    assert.equal((await call('GET', '/health')).json.ok, true)
    const missing = await call('GET', '/api/nope')
    assert.equal(missing.status, 404)
    assert.ok(missing.json.error)
  })

  it('serves a consistent demo dataset', async () => {
    const workers = (await call('GET', '/api/personnel')).json.items as Worker[]
    const contracts = (await call('GET', '/api/contracts')).json.items as Contract[]
    const brigades = (await call('GET', '/api/brigades')).json.items as Brigade[]
    assert.equal(workers.length, 30)
    assert.equal(contracts.length, 5)
    assert.equal(contracts.flatMap((c) => c.objects).length, 11)

    const reports = (await call('GET', '/api/reports')).json.items as DailyReport[]
    for (const object of contracts.flatMap((c) => c.objects)) {
      const own = reports.filter((r) => r.objectId === object.id)
      if (object.actualStart) assert.ok(own.length > 0, `${object.name}: no reports`)
      for (const work of object.works) {
        const reported = own.flatMap((r) => r.workItems).filter((w) => w.itemId === work.id).reduce((s, w) => s + w.volume, 0)
        assert.equal(reported, work.actualVolume, `${object.name} / ${work.title}`)
      }
    }
    assert.ok(brigades.some((b) => b.masterIds.length > 1))
    assert.ok(brigades.some((b) => b.foremanIds.length > 1))
    for (const b of brigades) assert.equal(validateBrigadeDraft(b, brigades, b.id), null, b.name)
  })

  it('returns PII to admin only', async () => {
    const asAdmin = (await call('GET', '/api/personnel', 'admin')).json.items as Worker[]
    const asOffice = (await call('GET', '/api/personnel', 'office')).json.items as Worker[]
    assert.ok(asAdmin.length > 0)
    assert.ok(asAdmin.every((w) => w.pii !== null))
    assert.ok(asOffice.every((w) => w.pii === null))
  })

  it('rejects PII writes from non-admin roles', async () => {
    const draft = {
      fullName: 'Тестов Тест',
      position: 'Слесарь',
      phone: '',
      hiredAt: '2026-01-10',
      note: '',
      pii: { snils: '123-456-789 00', birthDate: '1990-01-01', passport: '' },
    }
    assert.equal((await call('POST', '/api/personnel', 'office', draft)).status, 403)
    const created = await call('POST', '/api/personnel', 'admin', draft)
    assert.equal(created.status, 201)
    assert.equal(created.json.item.pii.snils, '123-456-789 00')
  })

  it('changes employment status and stores worker files', async () => {
    const worker = ((await call('GET', '/api/personnel')).json.items as Worker[]).find((w) => w.documents.length)
    assert.ok(worker)
    assert.equal((await call('PATCH', `/api/personnel/${worker.id}/employment`, 'master', { employment: 'vacation' })).status, 403)
    assert.equal((await call('PATCH', `/api/personnel/${worker.id}/employment`, 'office', { employment: 'vacation' })).status, 403)
    assert.equal((await call('PATCH', `/api/personnel/${worker.id}/employment`, 'admin', { employment: 'x' })).status, 400)
    const changed = await call('PATCH', `/api/personnel/${worker.id}/employment`, 'admin', { employment: 'vacation' })
    assert.equal(changed.json.item.employment, 'vacation')
    assert.deepEqual(changed.json.warnings, [])

    const query = new URLSearchParams({
      title: 'Удостоверение',
      fileName: 'Удостоверение №1.pdf',
      mimeType: 'application/pdf',
      expiresAt: '2027-01-01',
    })
    assert.equal((await upload(`/api/personnel/${worker.id}/documents?${query}`, 'POST', 'x', 'master')).status, 403)
    const created = await upload(`/api/personnel/${worker.id}/documents?${query}`, 'POST', '%PDF-demo')
    assert.equal(created.status, 201)
    const doc = ((await created.json()) as { item: Worker }).item.documents[0]
    assert.equal(doc.title, 'Удостоверение')
    assert.equal(doc.size, 9)
    assert.equal(doc.expiresAt, '2027-01-01')
    assert.equal(doc.qualificationTypeId, undefined)

    const file = await call('GET', `/api/personnel/${worker.id}/documents/${doc.id}/file`)
    assert.equal(file.text, '%PDF-demo')
    assert.match(file.headers.get('content-disposition') ?? '', /filename\*=UTF-8''/)

    const seeded = worker.documents[worker.documents.length - 1]
    const placeholder = await call('GET', `/api/personnel/${worker.id}/documents/${seeded.id}/file`)
    assert.equal(placeholder.status, 200)
    assert.match(placeholder.text, /Демо-документ/)

    const photoQuery = `?mimeType=${encodeURIComponent('text/plain')}`
    assert.equal((await upload(`/api/personnel/${worker.id}/photo${photoQuery}`, 'PUT', 'x')).status, 400)
    const photo = await upload(`/api/personnel/${worker.id}/photo?mimeType=image%2Fpng`, 'PUT', 'png')
    assert.equal(photo.status, 200)
    assert.ok(((await photo.json()) as { item: Worker }).item.photoUpdatedAt)
    const image = await call('GET', `/api/personnel/${worker.id}/photo`)
    assert.equal(image.headers.get('content-type'), 'image/png')
  })

  it('stores qualification documents with a default expiry', async () => {
    const worker = ((await call('GET', '/api/personnel')).json.items as Worker[]).find((w) => w.id === 'p-6')
    assert.ok(worker)
    const base = { title: 'Удостоверение ГОР', fileName: 'gor.pdf', mimeType: 'application/pdf' }
    const bad = new URLSearchParams({ ...base, qualificationTypeId: 'gas', group: 'II' })
    assert.equal((await upload(`/api/personnel/p-6/documents?${bad}`, 'POST', 'x')).status, 400)
    const query = new URLSearchParams({ ...base, qualificationTypeId: 'gas', number: 'ГО-900', issuedAt: '2026-09-01', issuer: 'УЦ' })
    const created = await upload(`/api/personnel/p-6/documents?${query}`, 'POST', 'x')
    assert.equal(created.status, 201)
    const doc = ((await created.json()) as { item: Worker }).item.documents[0]
    assert.equal(doc.qualificationTypeId, 'gas')
    assert.equal(doc.number, 'ГО-900')
    assert.equal(doc.expiresAt, '2027-09-01')
  })

  it('serves the qualification catalogue without position requirements', async () => {
    const view = (await call('GET', '/api/qualifications', 'master')).json.item
    assert.ok(view.types.length >= 10)
    assert.equal(view.requirements, undefined)
    assert.equal((await call('PUT', '/api/qualifications/requirements', 'admin', { requirements: [] })).status, 404)
  })

  it('rejects a second brigade on an occupied object', async () => {
    const [a] = (await call('GET', '/api/assignments')).json.items as BrigadeAssignment[]
    const other = ((await call('GET', '/api/brigades')).json.items as { id: string }[]).find((b) => b.id !== a.brigadeId)
    assert.ok(other)
    const taken = await call('POST', '/api/assignments', 'admin', { ...a, id: undefined, brigadeId: other.id, from: a.from, to: a.from })
    assert.equal(taken.status, 409)
    assert.match(taken.json.error, /На объекте уже работает/)
  })

  it('rejects overlapping brigade assignments', async () => {
    const existing = (await call('GET', '/api/assignments')).json.items as BrigadeAssignment[]
    const a = existing[0]
    const overlap = await call('POST', '/api/assignments', 'admin', {
      brigadeId: a.brigadeId,
      contractId: a.contractId,
      objectId: a.objectId,
      from: a.to,
      to: a.to,
      note: '',
    })
    assert.equal(overlap.status, 409)
    for (const role of ['master', 'storekeeper', 'office'] as const) {
      assert.equal((await call('POST', '/api/assignments', role, { ...a, id: undefined })).status, 403)
    }
  })

  it('blocks a brigade with an expired gas-hazard admission unless overridden with a comment', async () => {
    const draft = { brigadeId: 'b-4', contractId: 'c-2027-01', objectId: 'o-18', from: '2027-02-05', to: '2027-02-20', note: '' }
    const blocked = await call('POST', '/api/assignments', 'admin', draft)
    assert.equal(blocked.status, 409)
    assert.equal(blocked.json.canOverride, true)
    const issues = blocked.json.issues as AssignmentIssue[]
    assert.ok(issues.some((i) => i.workerId === 'p-24' && i.typeId === 'gas' && i.kind === 'expired' && i.date === '2026-08-01'))

    const original = (await call('GET', '/api/access', 'admin')).json.item.matrix.office as string[]
    await call('PATCH', '/api/access/roles/office', 'admin', { permissions: [...original, 'brigades_plan'] })
    const planner = await call('POST', '/api/assignments', 'office', { ...draft, overrideComment: 'Срочный выход по заявке заказчика' })
    const plannerBlocked = await call('POST', '/api/assignments', 'office', draft)
    await call('PATCH', '/api/access/roles/office', 'admin', { permissions: original })
    assert.equal(planner.status, 403)
    assert.match(planner.json.error, /без действующих допусков/)
    assert.equal(plannerBlocked.json.canOverride, false)

    assert.equal((await call('POST', '/api/assignments', 'admin', { ...draft, overrideComment: 'надо' })).status, 400)
    const forced = await call('POST', '/api/assignments', 'admin', { ...draft, overrideComment: 'Аттестация ГОР назначена на 03.02' })
    assert.equal(forced.status, 201)
    assert.equal(forced.json.item.override.by, 'Демо: Администратор')
    assert.ok(forced.json.warnings.some((w: string) => /без допусков/.test(w)))
  })

  it('assigns a qualified brigade, warns outside the plan and drops future assignments with the object', async () => {
    const draft = { brigadeId: 'b-2', contractId: 'c-2027-01', objectId: 'o-19', from: '2026-12-05', to: '2026-12-10', note: '' }
    const created = await call('POST', '/api/assignments', 'admin', draft)
    assert.equal(created.status, 201, created.text)
    assert.equal(created.json.item.override, undefined)
    assert.equal(created.json.warnings.length, 1)
    assert.match(created.json.warnings[0], /плановые сроки/)

    const removed = await call('DELETE', '/api/contracts/c-2027-01/objects/o-19')
    assert.equal(removed.status, 200)
    const after = (await call('GET', '/api/assignments')).json.items as BrigadeAssignment[]
    assert.ok(after.every((a) => a.objectId !== 'o-19'))
  })

  it('returns the crew on duty without fired workers and marks vacations', async () => {
    const a = ((await call('GET', '/api/assignments')).json.items as BrigadeAssignment[]).find((x) => x.id === 'a-1')
    assert.ok(a)
    await call('PATCH', '/api/personnel/p-4/employment', 'admin', { employment: 'vacation' })
    const fired = await call('PATCH', '/api/personnel/p-10/employment', 'admin', { employment: 'fired' })
    assert.equal(fired.status, 200)
    assert.equal(fired.json.item.brigadeId, null)
    assert.match(fired.json.warnings[0], /Выведен из состава: Бригада «Север»/)

    const crew = await call('GET', `/api/assignments/crew?objectId=${a.objectId}&date=${a.from}`)
    assert.equal(crew.status, 200)
    const [first] = crew.json.items as ObjectCrew[]
    assert.equal(first.assignment.id, a.id)
    const people = [...first.masters, ...first.foremen, ...first.members]
    assert.ok(people.every((m) => m.id !== 'p-10'))
    assert.equal(people.find((m) => m.id === 'p-4')?.employment, 'vacation')

    const brigade = ((await call('GET', '/api/brigades')).json.items as Brigade[]).find((b) => b.id === 'b-1')
    assert.ok(brigade && !brigade.memberIds.includes('p-10'))
    const rejoin = await call('PATCH', '/api/brigades/b-1', 'admin', { ...brigade, memberIds: [...brigade.memberIds, 'p-10'] })
    assert.equal(rejoin.status, 400)
  })

  it('adds, updates and removes object works', async () => {
    const contracts = (await call('GET', '/api/contracts')).json.items as Contract[]
    const contract = contracts[contracts.length - 1]
    const object = contract.objects[contract.objects.length - 1]
    const path = `/api/contracts/${contract.id}/objects/${object.id}/works`
    const draft = {
      title: 'Монтаж понтона',
      unit: 'шт.',
      plannedVolume: 2,
      actualVolume: 0,
      plannedStart: '2027-06-01',
      plannedEnd: '2027-06-20',
    }

    assert.equal((await call('POST', path, 'admin', { ...draft, unit: 'т' })).status, 400)

    const created = await call('POST', path, 'admin', draft)
    assert.equal(created.status, 201)
    const work = (created.json.item as Contract).objects
      .find((o) => o.id === object.id)
      ?.works.find((w) => w.title === draft.title)
    assert.ok(work)
    assert.equal(work.status, 'planned')

    const updated = await call('PATCH', `${path}/${work.id}`, 'admin', {
      ...draft,
      actualVolume: 1,
      actualStart: '2027-06-02',
    })
    assert.equal(updated.status, 200)
    const next = (updated.json.item as Contract).objects.find((o) => o.id === object.id)?.works.find((w) => w.id === work.id)
    assert.equal(next?.status, 'in_progress')
    assert.equal(next?.actualVolume, 1)

    const removed = await call('DELETE', `${path}/${work.id}`)
    assert.equal(removed.status, 200)
    const left = (removed.json.item as Contract).objects.find((o) => o.id === object.id)?.works ?? []
    assert.ok(left.every((w) => w.id !== work.id))
  })

  it('returns 404 for a missing report and saves a valid one', async () => {
    const objects = (await call('GET', '/api/reports/objects')).json.items as { id: string }[]
    const objectId = objects[0].id
    assert.equal((await call('GET', `/api/reports/${objectId}/2020-01-01`)).status, 404)
    assert.equal((await call('POST', '/api/reports', 'master', { objectId })).status, 403)
    const saved = await call('POST', '/api/reports', 'admin', {
      objectId,
      date: '2026-09-29',
      authorName: 'Тест',
      workStartFrom: '08:00',
      workStartTo: '08:30',
      estimatedCompletion: '2026-10-30',
      dronePeriods: [],
      staffItr: '1',
      staffForemen: '1',
      staffWorkers: '5',
      workStage: 'Зачистка',
      techMeans: 'Насос',
      volumes: '10 м³',
      workItems: [],
      ppe: '',
      nextDay: 'Продолжение',
      problems: '',
    })
    assert.equal(saved.status, 200)
    assert.equal((await call('GET', `/api/reports/${objectId}/2026-09-29`)).json.item.id, saved.json.item.id)
  })

  it('lets every viewer browse equipment and hides fill remarks from strangers', async () => {
    const admin = (await call('GET', '/api/equipment/state', 'admin')).json as EquipmentState
    const master = (await call('GET', '/api/equipment/state', 'master')).json as EquipmentState
    assert.equal(master.items.length, admin.items.length)
    assert.ok(admin.items.some((i) => i.category === 'VEHICLE'))
    assert.ok(admin.items.some((i) => i.category === 'CARD'))
    assert.ok(admin.items.some((i) => i.fillComment))
    assert.ok(master.items.every((i) => !i.fillComment))
    assert.ok(master.transfers.length < admin.transfers.length)

    assert.equal((await call('GET', '/api/equipment/export.xlsx', 'office')).status, 403)
    const xlsx = await download('/api/equipment/export.xlsx')
    assert.equal(xlsx.status, 200)
    assert.match(xlsx.headers.get('content-type') ?? '', /spreadsheetml\.sheet/)
    assert.match(unzip(xlsx.data).get('xl/worksheets/sheet1.xml') ?? '', /Транспорт/)
  })

  it('requires a note and moves items to repair on IN_REPAIR', async () => {
    const state = (await call('GET', '/api/equipment/state', 'admin')).json as EquipmentState
    const item = state.items.find(
      (i) => i.category === 'EQUIPMENT' && i.type === 'SERIAL' && i.condition === 'OK' && !i.pendingTransferId && i.fillStatus === 'OK',
    )
    assert.ok(item)
    const path = `/api/equipment/${item.id}/condition`
    assert.equal((await call('PATCH', path, 'admin', { condition: 'IN_REPAIR' })).status, 400)
    const updated = await call('PATCH', path, 'admin', { condition: 'IN_REPAIR', note: 'Не запускается' })
    assert.equal(updated.status, 200)
    const repair = state.warehouses.find((w) => w.slug === 'repair')
    assert.equal(updated.json.item.ownerWarehouseId, repair?.id)
    const history = (await call('GET', `/api/equipment/${item.id}/history`)).json.items as { action: string }[]
    assert.deepEqual(
      history.slice(0, 2).map((h) => h.action),
      ['MOVED_TO_REPAIR', 'CONDITION_CHANGED'],
    )
  })

  it('creates vehicles with unique plates and edits, flags and deletes them', async () => {
    const draft = {
      category: 'VEHICLE',
      name: 'УАЗ Патриот',
      vehicleKind: 'PASSENGER',
      plateNumber: 'о 555 ор 116',
      condition: 'OK',
      ownerType: 'USER',
      ownerUserId: DEMO_ADMIN,
    }
    const created = await call('POST', '/api/equipment', 'admin', draft)
    assert.equal(created.status, 201)
    const vehicle = created.json.item
    assert.equal(vehicle.plateNumber, 'O555OP116')
    assert.equal((await call('POST', '/api/equipment', 'admin', draft)).status, 409)

    const flagged = await call('POST', `/api/equipment/${vehicle.id}/fill/flag`, 'admin', { comment: 'Проверьте вид ТС' })
    assert.equal(flagged.json.item.fillStatus, 'NEEDS_FIX')
    assert.equal((await call('POST', `/api/equipment/${vehicle.id}/fill/flag`, 'master', { comment: 'x' })).status, 403)
    const blocked = await call('POST', '/api/equipment/transfers', 'admin', {
      equipmentId: vehicle.id,
      toOwnerType: 'USER',
      toUserId: DEMO_MASTER,
    })
    assert.equal(blocked.status, 403)

    const edited = await call('PATCH', `/api/equipment/${vehicle.id}`, 'admin', { vehicleKind: 'TRUCK' })
    assert.equal(edited.json.item.vehicleKind, 'TRUCK')
    assert.equal((await call('POST', `/api/equipment/${vehicle.id}/fill/confirm`, 'admin')).json.item.fillStatus, 'OK')

    assert.equal((await call('DELETE', `/api/equipment/${vehicle.id}`, 'master')).status, 403)
    assert.equal((await call('DELETE', `/api/equipment/${vehicle.id}`, 'admin')).status, 204)
  })

  it('transfers in bulk and reports failures per item', async () => {
    const state = (await call('GET', '/api/equipment/state', 'admin')).json as EquipmentState
    const free = state.items.filter((i) => i.ownerUserId === DEMO_MASTER && !i.pendingTransferId && i.fillStatus === 'OK')
    const pending = state.items.find((i) => i.pendingTransferId)
    assert.ok(free.length > 0 && pending)
    const result = await call('POST', '/api/equipment/transfers/bulk', 'admin', {
      ids: [...free.map((i) => i.id), pending.id],
      toOwnerType: 'WAREHOUSE',
      toWarehouseId: 'wh-south',
    })
    assert.equal(result.status, 200)
    assert.equal(result.json.item.transferred, free.length)
    assert.deepEqual(result.json.item.failed.map((f: { id: string }) => f.id), [pending.id])
  })

  it('stores equipment files and manages bases', async () => {
    const state = (await call('GET', '/api/equipment/state', 'admin')).json as EquipmentState
    const item = state.items.find((i) => i.category === 'EQUIPMENT')
    assert.ok(item)
    const query = new URLSearchParams({ fileName: 'Паспорт.pdf', mimeType: 'application/pdf' })
    const uploaded = await upload(`/api/equipment/${item.id}/documents?${query}`, 'POST', '%PDF-eq')
    assert.equal(uploaded.status, 201)
    const doc = ((await uploaded.json()) as { item: typeof item }).item.documents[0]
    assert.equal(doc.size, 7)
    assert.equal((await call('GET', `/api/equipment/${item.id}/documents/${doc.id}/file`)).text, '%PDF-eq')
    assert.equal((await call('DELETE', `/api/equipment/${item.id}/documents/${doc.id}`)).status, 200)

    assert.equal((await call('POST', '/api/equipment/warehouses', 'master', { name: 'База Восток' })).status, 403)
    const wh = await call('POST', '/api/equipment/warehouses', 'storekeeper', { name: 'База Восток', keeperIds: [DEMO_KEEPER] })
    assert.equal(wh.status, 201)
    assert.equal((await call('DELETE', '/api/equipment/warehouses/wh-repair')).status, 400)
    assert.equal((await call('DELETE', '/api/equipment/warehouses/wh-north')).status, 409)
    assert.equal((await call('DELETE', `/api/equipment/warehouses/${wh.json.item.id}`)).status, 204)
  })

  it('keeps one access matrix for the whole system', async () => {
    const asMaster = (await call('GET', '/api/access', 'master')).json.item
    assert.equal(asMaster.matrix, null)
    assert.ok(asMaster.permissions.includes('equipment.transfer'))
    const asOffice = (await call('GET', '/api/access', 'office')).json.item
    assert.deepEqual(asOffice.matrix.office, asOffice.permissions)

    assert.equal((await call('PATCH', '/api/access/roles/master', 'office', { permissions: [] })).status, 403)
    assert.equal((await call('PATCH', '/api/access/roles/admin', 'admin', { permissions: [] })).status, 400)
    assert.equal((await call('PATCH', '/api/access/roles/office', 'admin', { permissions: ['personnel_pii'] })).status, 400)
    assert.equal((await call('PATCH', '/api/access/roles/nobody', 'admin', { permissions: [] })).status, 404)

    const original = asOffice.permissions as string[]
    const matrix = await call('PATCH', '/api/access/roles/office', 'admin', { permissions: ['reports_view'] })
    assert.deepEqual(matrix.json.item.office, ['reports_view'])
    const [personnel, objects, equipment] = await Promise.all([
      call('GET', '/api/personnel', 'office'),
      call('GET', '/api/reports/objects', 'office'),
      call('GET', '/api/equipment/state', 'office'),
    ])
    await call('PATCH', '/api/access/roles/office', 'admin', { permissions: original })
    assert.equal(personnel.status, 403)
    assert.match(personnel.json.error, /Персонал — Просмотр/)
    assert.equal(objects.status, 200)
    assert.equal(equipment.json.items.length, 0)
    assert.equal((await call('GET', '/api/personnel', 'office')).status, 200)
  })

  it('lets office, master and storekeeper only view contracts, personnel and reports', async () => {
    const contract = ((await call('GET', '/api/contracts')).json.items as Contract[])[0]
    for (const role of ['office', 'master', 'storekeeper'] as const) {
      assert.equal((await call('GET', '/api/contracts', role)).status, 200)
      assert.equal((await call('GET', '/api/personnel', role)).status, 200)
      assert.equal((await call('GET', '/api/reports', role)).status, 200)
      const denied = await call('PATCH', `/api/contracts/${contract.id}`, role, { name: 'x' })
      assert.equal(denied.status, 403)
      assert.match(denied.json.error, /Контракты/)
    }
  })

  it('replaces deletion with dismissal and archive when there is history', async () => {
    assert.equal((await call('DELETE', '/api/personnel/p-1')).status, 409)
    const fresh = await call('POST', '/api/personnel', 'admin', { fullName: 'Новиков Олег', position: 'Рабочий', phone: '', hiredAt: '', note: '' })
    assert.equal((await call('DELETE', `/api/personnel/${fresh.json.item.id}`)).status, 204)

    const brigadeDelete = await call('DELETE', '/api/brigades/b-1')
    assert.equal(brigadeDelete.status, 409)
    assert.match(brigadeDelete.json.error, /архив/)
    assert.equal((await call('PATCH', '/api/brigades/b-1/archive', 'admin', { archived: true })).status, 409)

    const archived = await call('PATCH', '/api/brigades/b-2/archive', 'admin', { archived: true })
    assert.equal(archived.status, 200)
    assert.equal(archived.json.item.archived, true)
    const assignments = (await call('GET', '/api/assignments?brigadeId=b-2')).json.items as BrigadeAssignment[]
    assert.ok(assignments.every((a) => a.from <= TODAY))
    const p5 = (await call('GET', '/api/personnel/p-5')).json.item as Worker
    assert.equal(p5.brigadeId, null)

    assert.equal((await call('DELETE', '/api/contracts/c-2026-01')).status, 409)
    assert.equal((await call('DELETE', '/api/contracts/c-2026-01/objects/o-1')).status, 409)
    assert.equal((await call('PATCH', '/api/contracts/c-2026-01/archive', 'admin', { archived: true })).status, 409)
    const contract = await call('PATCH', '/api/contracts/c-2027-01/archive', 'admin', { archived: true })
    assert.equal(contract.status, 200)
    assert.equal(contract.json.item.archived, true)
    const toArchived = await call('POST', '/api/assignments', 'admin', {
      brigadeId: 'b-3',
      contractId: 'c-2027-01',
      objectId: 'o-20',
      from: '2027-08-01',
      to: '2027-08-05',
      note: '',
    })
    assert.equal(toArchived.status, 409)
    assert.match(toArchived.json.error, /в архиве/)
  })

  it('moves an object through its lifecycle and closes brigade assignments on completion', async () => {
    const assignment = ((await call('GET', '/api/assignments')).json.items as BrigadeAssignment[]).find((a) => a.id === 'a-1')
    assert.ok(assignment)
    const base = `/api/contracts/${assignment.contractId}/objects/${assignment.objectId}`
    const objectOf = (result: CallResult) =>
      (result.json.item as Contract).objects.find((o) => o.id === assignment.objectId)
    const setStatus = (body: object, who: RoleId = 'admin') => call('PATCH', `${base}/status`, who, body)

    assert.equal((await setStatus({ status: 'done', date: TODAY }, 'office')).status, 403)
    const current = objectOf(await call('GET', `/api/contracts/${assignment.contractId}`))
    if (!current?.actualStart) assert.equal((await setStatus({ status: 'in_progress', date: TODAY })).status, 200)
    assert.equal((await setStatus({ status: 'in_progress', date: TODAY })).status, 400)
    assert.equal((await setStatus({ status: 'done', date: '2099-01-01' })).status, 400)

    const done = await setStatus({ status: 'done', date: TODAY })
    assert.equal(done.status, 200, done.text)
    assert.equal(objectOf(done)?.actualEnd, TODAY)
    assert.equal(objectOf(done)?.deadlineEdits[0].field, 'actualEnd')
    const left = ((await call('GET', `/api/assignments?objectId=${assignment.objectId}`)).json.items as BrigadeAssignment[])
    assert.ok(left.every((a) => a.to <= TODAY))

    const late = await call('POST', '/api/assignments', 'admin', {
      ...assignment,
      from: TODAY,
      to: '2026-12-31',
    })
    assert.equal(late.status, 409)
    assert.match(late.json.error, /завершён/)
    assert.equal((await call('PATCH', base, 'admin', { actualEnd: '' })).status, 400)

    const reopened = await setStatus({ status: 'in_progress' })
    assert.equal(reopened.status, 200)
    assert.equal(objectOf(reopened)?.actualEnd, undefined)
  })

  it('exposes report days and exports schedules to Excel', async () => {
    const days = (await call('GET', '/api/contracts/report-days')).json.items as ReportDay[]
    const reported = days.find((d) => d.workIds.length)
    assert.ok(reported)

    const summary = await download('/api/contracts/export.xlsx')
    assert.equal(summary.status, 200)
    assert.match(summary.headers.get('content-type') ?? '', /spreadsheetml\.sheet/)
    assert.match(summary.headers.get('content-disposition') ?? '', /attachment; .*\.xlsx/)
    assert.match(unzip(summary.data).get('xl/workbook.xml') ?? '', /name="Сводный график"/)

    const object = unzip((await download(`/api/contracts/export.xlsx?objectId=${reported.objectId}`)).data)
    assert.match(object.get('xl/worksheets/sheet1.xml') ?? '', /Объект целиком/)
    assert.match(object.get('xl/workbook.xml') ?? '', /name="Отчёты"/)
    assert.equal((await call('GET', '/api/contracts/export.xlsx?objectId=missing')).status, 404)
  })
})

describe('authentication', () => {
  it('sends security headers and hides the framework', async () => {
    const response = await call('GET', '/health', null)
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN')
    assert.equal(response.headers.get('x-powered-by'), null)
  })

  it('ignores the role header: no session means 401, the header never grants PII', async () => {
    const anonymous = await call('GET', '/api/personnel', null, undefined, { 'x-erp-role': 'admin' })
    assert.equal(anonymous.status, 401)
    const spoofed = await call('GET', '/api/personnel', 'office', undefined, { 'x-erp-role': 'admin' })
    assert.equal(spoofed.status, 200)
    assert.ok((spoofed.json.items as Worker[]).every((w) => w.pii === null))
    const session = await call('GET', '/api/auth/session', null)
    assert.deepEqual(session.json.item, { user: null, devLogin: true, bitrixLogin: false })
  })

  it('manages users and signs in with a password', async () => {
    assert.equal((await call('GET', '/api/users', 'office')).status, 403)
    const draft = { login: 'Ivanov.I', fullName: 'Иванов Иван', role: 'master', workerId: null, active: true, password: 'пароль-надёжный' }
    assert.equal((await call('POST', '/api/users', 'admin', { ...draft, password: 'short' })).status, 400)
    const created = await call('POST', '/api/users', 'admin', draft)
    assert.equal(created.status, 201)
    const user = created.json.item as User
    assert.equal(user.login, 'ivanov.i')
    assert.equal('password' in user || 'passwordHash' in user, false)
    assert.equal((await call('POST', '/api/users', 'admin', draft)).status, 409)

    const wrong = await call('POST', '/api/auth/login', null, { login: 'ivanov.i', password: 'не-тот-пароль' })
    assert.equal(wrong.status, 401)
    const response = await fetch(`${api.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'IVANOV.I', password: draft.password }),
    })
    assert.equal(response.status, 200)
    const setCookie = response.headers.get('set-cookie') ?? ''
    assert.match(setCookie, /HttpOnly/i)
    assert.match(setCookie, /SameSite=Lax/i)
    const cookie = { cookie: sessionCookie(response) }
    assert.equal((await call('GET', '/api/auth/session', cookie)).json.item.user.id, user.id)
    const workers = (await call('GET', '/api/personnel', cookie, undefined, { 'x-erp-role': 'admin' })).json.items as Worker[]
    assert.ok(workers.every((w) => w.pii === null))

    const blocked = await call('PATCH', `/api/users/${user.id}`, 'admin', { active: false })
    assert.equal(blocked.json.item.active, false)
    assert.equal((await call('GET', '/api/auth/session', cookie)).json.item.user, null)
    assert.equal((await call('POST', '/api/auth/login', null, { login: 'ivanov.i', password: draft.password })).status, 401)

    const users = (await call('GET', '/api/users')).json.items as User[]
    const admin = users.find((u) => u.login === 'demo.admin')
    assert.ok(admin)
    const demote = await call('PATCH', `/api/users/${admin.id}`, 'admin', { role: 'office' })
    assert.equal(demote.status, 409)
  })

  it('logs out and refuses dev login outside dev mode', async () => {
    const isolated = await startApp({ devLogin: false, admin: { login: 'root', password: 'корневой-пароль' } })
    try {
      assert.equal((await isolated.call('POST', '/api/auth/dev-login', null, { role: 'admin' })).status, 404)
      const response = await fetch(`${isolated.base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: 'root', password: 'корневой-пароль' }),
      })
      const cookie = { cookie: sessionCookie(response) }
      const session = (await isolated.call('GET', '/api/auth/session', cookie)).json.item
      assert.equal(session.user.role, 'admin')
      assert.equal(session.devLogin, false)
      assert.equal((await isolated.call('POST', '/api/auth/logout', cookie)).status, 204)
      assert.equal((await isolated.call('GET', '/api/personnel', cookie)).status, 401)
    } finally {
      await isolated.close()
    }
  })
})

describe('bitrix sign-in', () => {
  const bitrix = createFakeBitrix()
  let sso: Api

  before(async () => {
    bitrix.addUser('36', 'Сидорова', 'Мария')
    bitrix.addUser('42', 'Кузнецов', 'Игорь')
    bitrix.addUser('57', 'Орлов', 'Олег', false)
    sso = await startApp({
      bitrix: { mode: 'live', webhookUrl: FAKE_WEBHOOK, clientId: FAKE_CLIENT_ID, clientSecret: FAKE_CLIENT_SECRET },
      bitrixFetch: bitrix.fetchImpl,
    })
  })

  after(async () => {
    await sso.close()
  })

  function get(url: string, cookie?: string) {
    return fetch(`${sso.base}${url}`, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} })
  }

  async function begin(to: string) {
    const response = await get(`/api/auth/bitrix/start?to=${encodeURIComponent(to)}`)
    assert.equal(response.status, 302)
    const location = new URL(response.headers.get('location') ?? '')
    const cookie = /erp_bitrix_state=[^;]+/.exec(response.headers.get('set-cookie') ?? '')?.[0]
    assert.ok(cookie, 'state cookie is set')
    return { location, state: location.searchParams.get('state') ?? '', cookie }
  }

  async function signIn(bitrixUserId: string, to = '/', endpoint?: string) {
    const { state, cookie } = await begin(to)
    const code = bitrix.issueCode(bitrixUserId, endpoint)
    const response = await get(`/api/auth/bitrix/callback?code=${code}&state=${state}&domain=portal.example`, cookie)
    assert.equal(response.status, 302)
    const session = /erp_session=[^;]+/.exec(response.headers.get('set-cookie') ?? '')?.[0] ?? null
    return { location: response.headers.get('location') ?? '', session }
  }

  async function createUser(body: Record<string, unknown>) {
    return sso.call('POST', '/api/users', 'admin', { role: 'master', workerId: null, active: true, ...body })
  }

  it('shows the button and sends the user to the portal OAuth page', async () => {
    assert.equal((await sso.call('GET', '/api/auth/session', null)).json.item.bitrixLogin, true)
    const { location, state } = await begin('/equipment')
    assert.equal(location.origin, FAKE_PORTAL)
    assert.equal(location.pathname, '/oauth/authorize/')
    assert.equal(location.searchParams.get('client_id'), FAKE_CLIENT_ID)
    assert.ok(state.length >= 32)
  })

  it('links a Bitrix24 user without a password and signs in straight into the module', async () => {
    const created = await createUser({ login: 'sidorova', fullName: 'Сидорова Мария', bitrixUserId: '36' })
    assert.equal(created.status, 201)
    assert.equal(created.json.item.hasPassword, false)
    assert.equal(created.json.item.bitrixUserId, '36')
    assert.equal((await sso.call('POST', '/api/auth/login', null, { login: 'sidorova', password: 'какой-нибудь' })).status, 401)
    const taken = await createUser({ login: 'other', fullName: 'Другой', bitrixUserId: '36' })
    assert.equal(taken.status, 409)
    assert.match(taken.json.error, /Сидорова Мария/)

    const { location, session } = await signIn('36', '/equipment/mine?category=vehicles')
    assert.equal(location, '/equipment/mine?category=vehicles')
    assert.ok(session)
    const view = (await sso.call('GET', '/api/auth/session', { cookie: session })).json.item
    assert.equal(view.user.id, created.json.item.id)

    const again = await get('/api/auth/bitrix/start?to=%2Freports', session)
    assert.equal(again.headers.get('location'), '/reports', 'an existing session skips Bitrix24')
  })

  it('refuses unknown, fired and blocked users with a code, never a session', async () => {
    const notLinked = await signIn('42', '/equipment')
    assert.equal(notLinked.session, null)
    assert.equal(notLinked.location, '/login?bitrixError=not-linked&redirect=%2Fequipment')

    await createUser({ login: 'orlov', fullName: 'Орлов Олег', bitrixUserId: '57' })
    assert.match((await signIn('57')).location, /bitrixError=blocked/, 'deactivated in Bitrix24')

    const kuznetsov = await createUser({ login: 'kuznetsov', fullName: 'Кузнецов Игорь', bitrixUserId: '42', active: false })
    assert.equal(kuznetsov.status, 201)
    const blocked = await signIn('42')
    assert.match(blocked.location, /bitrixError=blocked/, 'blocked in the ERP')
    assert.equal(blocked.session, null)
  })

  it('rejects a forged or reused state, another portal and an external redirect', async () => {
    const { state, cookie } = await begin('/')
    const code = bitrix.issueCode('36')
    const noCookie = await get(`/api/auth/bitrix/callback?code=${code}&state=${state}`)
    assert.match(noCookie.headers.get('location') ?? '', /bitrixError=expired/, 'state must come from this browser')
    const forged = await get(`/api/auth/bitrix/callback?code=${code}&state=forged`, cookie)
    assert.match(forged.headers.get('location') ?? '', /bitrixError=expired/)

    const first = await get(`/api/auth/bitrix/callback?code=${code}&state=${state}`, cookie)
    assert.ok(/erp_session=/.test(first.headers.get('set-cookie') ?? ''))
    const reused = await get(`/api/auth/bitrix/callback?code=${bitrix.issueCode('36')}&state=${state}`, cookie)
    assert.match(reused.headers.get('location') ?? '', /bitrixError=expired/, 'a state works once')

    const foreign = await signIn('36', '/', 'https://evil.bitrix24.ru/rest/')
    assert.equal(foreign.session, null)
    assert.match(foreign.location, /bitrixError=wrong-portal/)

    const external = await signIn('36', '//evil.example/steal')
    assert.equal(external.location, '/')
    assert.ok(external.session)

    const declined = await begin('/')
    const denied = await get(`/api/auth/bitrix/callback?error=access_denied&state=${declined.state}`, declined.cookie)
    assert.match(denied.headers.get('location') ?? '', /bitrixError=denied/)
  })

  it('finds portal users for linking through the webhook (admins only)', async () => {
    assert.equal((await sso.call('GET', '/api/users/bitrix?q=Сидор', 'master')).status, 403)
    const found = await sso.call('GET', `/api/users/bitrix?q=${encodeURIComponent('Сидор')}`)
    assert.deepEqual(found.json.items.map((u: { id: string; fullName: string }) => [u.id, u.fullName]), [['36', 'Сидорова Мария']])
    const byId = (await sso.call('GET', '/api/users/bitrix?q=57')).json.items
    assert.equal(byId[0].isActive, false, 'lookup by ID shows fired users too')
    assert.deepEqual((await sso.call('GET', '/api/users/bitrix?q=Орлов')).json.items, [], 'search hides fired users')
  })

  it('keeps an account reachable: unlinking needs a password', async () => {
    const created = await createUser({ login: 'unlink.me', fullName: 'Отвязка', bitrixUserId: '99' })
    const id = created.json.item.id as string
    assert.equal((await sso.call('PATCH', `/api/users/${id}`, 'admin', { bitrixUserId: null })).status, 400)
    const unlinked = await sso.call('PATCH', `/api/users/${id}`, 'admin', { bitrixUserId: null, password: 'новый-пароль-1' })
    assert.equal(unlinked.status, 200)
    assert.equal(unlinked.json.item.hasPassword, true)
    assert.equal((await sso.call('POST', '/api/auth/login', null, { login: 'unlink.me', password: 'новый-пароль-1' })).status, 200)
  })

  it('stays off without the local application keys', async () => {
    const response = await fetch(`${api.base}/api/auth/bitrix/start?to=%2Fpersonnel`, { redirect: 'manual' })
    assert.equal(response.headers.get('location'), '/login?bitrixError=disabled&redirect=%2Fpersonnel')
    const mock = await call('GET', '/api/users/bitrix?q=36')
    assert.equal(mock.json.items[0].fullName, 'Сидорова Мария Ивановна', 'mock directory in dev')
  })
})

describe('training', () => {
  let training: Api

  before(async () => {
    training = await startApp({ publicUrl: 'https://erp.example' })
  })

  after(async () => {
    await training.close()
  })

  async function workerOf(workerId: string): Promise<Worker> {
    return (await training.call('GET', `/api/personnel/${workerId}`)).json.item as Worker
  }

  async function assign(workerIds: string[], extra: Record<string, unknown> = {}) {
    return training.call('POST', '/api/training/assignments', 'admin', {
      testId: 'test-fire',
      workerIds,
      dueDate: '2026-10-06',
      kind: 'regular',
      ...extra,
    })
  }

  function tokenOf(link: string): string {
    const token = link.split('/t/')[1]
    assert.ok(token, 'link contains the token')
    return token
  }

  async function confirmed(token: string): Promise<{ cookie: string; item: Record<string, unknown> }> {
    const response = await fetch(`${training.base}/api/public/test/${token}/confirm`, { method: 'POST' })
    assert.equal(response.status, 200)
    const match = /erp_test=[^;]+/.exec(response.headers.get('set-cookie') ?? '')
    assert.ok(match, 'test session cookie is set')
    assert.match(response.headers.get('set-cookie') ?? '', /HttpOnly/i)
    return { cookie: match[0], item: ((await response.json()) as { item: Record<string, unknown> }).item }
  }

  it('requires training permissions for management and assignment', async () => {
    assert.equal((await training.call('GET', '/api/training/directions', 'office')).status, 200)
    const draft = { title: 'Тест', programId: 'pr-fire', questions: [] }
    assert.equal((await training.call('POST', '/api/training/tests', 'office', draft)).status, 403)
    assert.equal((await training.call('GET', '/api/training/tests/test-fire', 'office')).status, 403)
    assert.equal((await training.call('POST', '/api/training/assignments', 'office', { testId: 'test-fire' })).status, 403)
    assert.equal((await training.call('GET', '/api/training/tests/test-fire', 'safety_engineer')).status, 200)
    assert.equal((await training.call('GET', '/api/training/storage/check', 'safety_engineer')).status, 403)
    const check = await training.call('GET', '/api/training/storage/check', 'admin')
    assert.equal(check.status, 200)
    assert.equal(check.json.item.mode, 'mock')
  })

  it('runs a knowledge check through the public link without leaking answers or the phone', async () => {
    const result = await assign(['p-4'])
    assert.equal(result.status, 201)
    const [created] = result.json.created
    assert.match(created.link, /^https:\/\/erp\.example\/t\//)
    assert.doesNotMatch(created.message, /телефон/)
    const token = tokenOf(created.link)
    const worker = await workerOf('p-4')

    const view = await training.call('GET', `/api/public/test/${token}`, null)
    assert.equal(view.status, 200)
    assert.equal(view.json.item.isConfirmed, false)
    assert.equal(view.json.item.workerName, worker.fullName, 'the worker sees the full name to confirm it is them')
    assert.ok(worker.phone && !view.text.includes(worker.phone), 'the phone is never returned')
    assert.ok(!/phone|snils/i.test(view.text), 'no personal data besides the name')
    for (const path of ['materials', 'start', 'finish']) {
      const method = path === 'materials' ? 'GET' : 'POST'
      assert.equal((await training.call(method, `/api/public/test/${token}/${path}`, null)).status, 403, `${path} needs «Это я»`)
    }

    const session = await confirmed(token)
    assert.equal(session.item.isConfirmed, true)
    assert.equal(session.item.status, 'opened')
    assert.equal((await training.call('GET', `/api/public/test/${token}`, session)).json.item.isConfirmed, true)
    assert.equal((await training.call('POST', `/api/public/test/${token}/start`, { cookie: 'erp_test=forged' })).status, 403)

    const started = await training.call('POST', `/api/public/test/${token}/start`, session)
    assert.equal(started.status, 200)
    assert.ok(!/correctOptionIds|explanation/.test(started.text), 'no correct answers before finishing')

    const bank = (await training.call('GET', '/api/training/tests/test-fire')).json.item.questions as {
      id: string
      correctOptionIds: string[]
    }[]
    for (const question of started.json.item.questions as { id: string }[]) {
      const correct = bank.find((q) => q.id === question.id)
      assert.ok(correct)
      const saved = await training.call('PUT', `/api/public/test/${token}/answers/${question.id}`, session, { optionIds: correct.correctOptionIds })
      assert.equal(saved.status, 200)
    }
    const finished = await training.call('POST', `/api/public/test/${token}/finish`, session)
    assert.equal(finished.status, 200)
    assert.equal(finished.json.item.isPassed, true)
    assert.equal(finished.json.item.percent, 100)

    const restart = await training.call('POST', `/api/public/test/${token}/start`, session)
    assert.equal(restart.status, 409)
    assert.equal((await training.call('POST', `/api/public/test/${token}/confirm`, null)).status, 409, 'a finished check cannot be reopened')

    const certs = (await training.call('GET', '/api/training/workers/p-4/certifications')).json.item
    const fire = certs.statuses.find((s: { programId: string }) => s.programId === 'pr-fire')
    assert.equal(fire.state, 'valid')
  })

  it('confirms «Это я» only for a live link and drops the session when the link is reissued', async () => {
    assert.equal((await training.call('POST', '/api/public/test/unknown-token/confirm', null)).status, 410)

    const [created] = (await assign(['p-9'])).json.created
    const token = tokenOf(created.link)
    const session = await confirmed(token)
    assert.equal((await training.call('GET', `/api/public/test/${token}/materials`, session)).status, 200)

    const reissued = await training.call('POST', `/api/training/assignments/${created.assignment.id}/reissue`, 'admin')
    assert.equal(reissued.status, 200)
    assert.equal((await training.call('GET', `/api/public/test/${token}`, null)).status, 410, 'the old link stops working')
    const fresh = tokenOf(reissued.json.item.link)
    assert.equal((await training.call('GET', `/api/public/test/${fresh}`, session)).json.item.isConfirmed, false, 'old session is not carried over')

    const cancelled = await training.call('POST', `/api/training/assignments/${created.assignment.id}/cancel`, 'admin', { reason: 'Тест' })
    assert.equal(cancelled.status, 200)
    assert.equal((await training.call('POST', `/api/public/test/${fresh}/confirm`, null)).status, 410)
  })

  it('refuses «Это я» after the due date', async () => {
    let today = TODAY
    const clocked = await startApp({ publicUrl: 'https://erp.example', today: () => today })
    try {
      const assigned = await clocked.call('POST', '/api/training/assignments', 'admin', {
        testId: 'test-fire',
        workerIds: ['p-10'],
        dueDate: '2026-09-30',
        kind: 'regular',
      })
      const token = tokenOf(assigned.json.created[0].link)
      assert.equal((await clocked.call('GET', `/api/public/test/${token}`, null)).json.item.status, 'opened')
      today = '2026-10-01'
      const view = await clocked.call('GET', `/api/public/test/${token}`, null)
      assert.equal(view.json.item.status, 'expired')
      assert.equal((await clocked.call('POST', `/api/public/test/${token}/confirm`, null)).status, 410)
    } finally {
      await clocked.close()
    }
  })

  it('replaces a regular check with an extraordinary one and skips duplicates', async () => {
    const regular = (await assign(['p-11'])).json.created[0]
    const duplicate = await assign(['p-11'])
    assert.equal(duplicate.json.created.length, 0)
    assert.equal(duplicate.json.skipped[0].reason, 'active_exists')

    const noReason = await assign(['p-11'], { kind: 'extraordinary' })
    assert.equal(noReason.status, 400)
    const extraordinary = await assign(['p-11'], { kind: 'extraordinary', reason: 'incident', reasonNote: 'Возгорание на объекте' })
    assert.equal(extraordinary.json.created.length, 1)
    assert.equal(extraordinary.json.created[0].assignment.kind, 'extraordinary')
    assert.equal((await training.call('GET', `/api/public/test/${tokenOf(regular.link)}`, null)).status, 410)
  })

  it('cancels active checks when a worker is dismissed', async () => {
    const [created] = (await assign(['p-12'])).json.created
    const fired = await training.call('PATCH', '/api/personnel/p-12/employment', 'admin', { employment: 'fired' })
    assert.ok((fired.json.warnings as string[]).some((w) => w.includes('проверки знаний')))
    assert.equal((await training.call('GET', `/api/public/test/${tokenOf(created.link)}`, null)).status, 410)
    const again = await assign(['p-12'])
    assert.equal(again.json.skipped[0].reason, 'fired')
  })

  it('rejects unknown public tokens', async () => {
    assert.equal((await training.call('GET', '/api/public/test/unknown-token', null)).status, 410)
  })
})

describe('bitrix disk', () => {
  let disk: MockDisk
  let app: Api

  before(async () => {
    app = await startApp({ disk: (storage) => (disk = createMockDisk(storage)) })
  })

  after(async () => {
    await app.close()
  })

  async function workerDoc(workerId: string, title: string, content: string) {
    const query = new URLSearchParams({ title, fileName: `${title}.pdf`, mimeType: 'application/pdf' })
    const response = await app.upload(`/api/personnel/${workerId}/documents?${query}`, 'POST', content)
    assert.equal(response.status, 201)
    return ((await response.json()) as { item: Worker }).item
  }

  async function diskIdOf(storagePath: string): Promise<string> {
    const folder = storagePath.split('/').slice(1, -1)
    const files = await disk.list(await ensurePath(disk, folder.slice(1)))
    const file = files.find((f) => f.path === storagePath)
    assert.ok(file, `${storagePath} is on Disk`)
    return file.fileId
  }

  it('stores worker documents in «ERP/Персонал/<ФИО>» and trashes them on delete', async () => {
    const worker = await workerDoc('p-3', 'Паспорт', '%PDF-passport')
    const doc = worker.documents[0]
    assert.equal(doc.storagePath, `mock-disk/ERP/Персонал/${worker.fullName}/Паспорт.pdf`)
    assert.ok(!('diskFileId' in doc), 'the Disk id stays on the server')
    const fileId = await diskIdOf(doc.storagePath ?? '')
    assert.equal((await app.call('GET', `/api/personnel/p-3/documents/${doc.id}/file`)).text, '%PDF-passport')

    assert.equal((await app.call('DELETE', `/api/personnel/p-3/documents/${doc.id}`)).status, 200)
    assert.deepEqual([...(await disk.missing([fileId]))], [fileId], 'deleted in ERP → Bitrix trash')
  })

  it('drops a document deleted on Disk as soon as someone tries to download it', async () => {
    const doc = (await workerDoc('p-5', 'Медсправка', '%PDF-med')).documents[0]
    disk.deleteOnDisk(await diskIdOf(doc.storagePath ?? ''))
    const response = await app.call('GET', `/api/personnel/p-5/documents/${doc.id}/file`)
    assert.equal(response.status, 404)
    assert.equal(response.json.error, 'Файл удалён на Диске Битрикс')
    const worker = (await app.call('GET', '/api/personnel/p-5')).json.item as Worker
    assert.ok(!worker.documents.some((d) => d.id === doc.id))
  })

  it('removes files deleted on Disk from every module on sync', async () => {
    const doc = (await workerDoc('p-7', 'Удостоверение', '%PDF-id')).documents[0]
    const photo = await app.upload('/api/personnel/p-7/photo?mimeType=image%2Fpng', 'PUT', 'png-bytes')
    assert.equal(photo.status, 200)

    const item = ((await app.call('GET', '/api/equipment/state')).json as EquipmentState).items.find((i) => i.category === 'EQUIPMENT')
    assert.ok(item)
    const eq = await app.upload(`/api/equipment/${item.id}/documents?fileName=${encodeURIComponent('Паспорт изделия.pdf')}&mimeType=application%2Fpdf`, 'POST', '%PDF-eq')
    const eqDoc = ((await eq.json()) as { item: typeof item }).item.documents[0]
    assert.match(eqDoc.storagePath, /^mock-disk\/ERP\/Оборудование\/.+\/Паспорт изделия\.pdf$/)

    const material = await app.upload(
      `/api/training/materials/upload?${new URLSearchParams({ title: 'Инструкция', programId: 'pr-fire', fileName: 'Инструкция.pdf' })}`,
      'POST',
      '%PDF-mat',
    )
    assert.equal(material.status, 201)
    const mat = ((await material.json()) as { item: { id: string; storagePath: string } }).item
    assert.match(mat.storagePath, /^mock-disk\/ERP\/Учебные материалы\/Пожарная безопасность\//)

    const worker = (await app.call('GET', '/api/personnel/p-7')).json.item as Worker
    const photoId = (await disk.list(await ensurePath(disk, ['Персонал', worker.fullName]))).find((f) => f.name === 'Фото.png')?.fileId
    assert.ok(photoId, 'the photo is on Disk')
    for (const path of [doc.storagePath ?? '', eqDoc.storagePath, mat.storagePath]) disk.deleteOnDisk(await diskIdOf(path))
    disk.deleteOnDisk(photoId)

    assert.equal((await app.call('POST', '/api/disk/sync', 'office')).status, 403)
    const sync = await app.call('POST', '/api/disk/sync', 'admin')
    assert.equal(sync.status, 200)
    assert.equal(sync.json.item.removed.length, 4)

    const after = (await app.call('GET', '/api/personnel/p-7')).json.item as Worker
    assert.ok(!after.documents.some((d) => d.id === doc.id))
    assert.equal(after.photoUpdatedAt, null)
    assert.equal((await app.call('GET', '/api/personnel/p-7/photo')).status, 404)
    const items = ((await app.call('GET', '/api/equipment/state')).json as EquipmentState).items
    assert.ok(!items.find((i) => i.id === item.id)?.documents.some((d) => d.id === eqDoc.id))
    const history = (await app.call('GET', `/api/equipment/${item.id}/history`)).json.items as { details: string }[]
    assert.ok(history.some((h) => /удалён на Диске Битрикс/.test(h.details)))
    const materials = (await app.call('GET', '/api/training/materials')).json.items as { id: string; isUnavailable: boolean }[]
    assert.equal(materials.find((m) => m.id === mat.id)?.isUnavailable, true, 'tests still refer to the material')
    assert.deepEqual((await app.call('POST', '/api/disk/sync', 'admin')).json.item.removed, [])
  })

  it('trashes an uploaded training material on delete but never a linked one', async () => {
    const upload = await app.upload(
      `/api/training/materials/upload?${new URLSearchParams({ title: 'Памятка', programId: 'pr-fire', fileName: 'Памятка.pdf' })}`,
      'POST',
      '%PDF-memo',
    )
    const uploaded = ((await upload.json()) as { item: { id: string; storagePath: string } }).item
    const uploadedId = await diskIdOf(uploaded.storagePath)
    const linkedFile = await disk.upload(await ensurePath(disk, ['Учебные материалы']), 'Чужой файл.pdf', { data: Buffer.from('x'), mimeType: 'application/pdf' })
    const linked = await app.call('POST', '/api/training/materials', 'admin', { title: 'Ссылка', programIds: ['pr-fire'], url: linkedFile.url })
    assert.equal(linked.status, 201)
    const outside = await disk.upload(await ensurePath(disk, ['Оборудование']), 'Вне.pdf', { data: Buffer.from('x'), mimeType: 'application/pdf' })
    assert.equal((await app.call('POST', '/api/training/materials', 'admin', { title: 'Вне', programIds: ['pr-fire'], url: outside.url })).status, 400)

    assert.equal((await app.call('DELETE', `/api/training/materials/${uploaded.id}`)).status, 204)
    assert.equal((await app.call('DELETE', `/api/training/materials/${linked.json.item.id}`)).status, 204)
    assert.deepEqual([...(await disk.missing([uploadedId, linkedFile.fileId]))], [uploadedId])
  })

  it('reports the Disk root to administrators', async () => {
    assert.equal((await app.call('GET', '/api/disk/check', 'master')).status, 403)
    assert.deepEqual((await app.call('GET', '/api/disk/check', 'admin')).json.item, { mode: 'mock', rootPath: 'mock-disk/ERP' })
  })

  it('uploads through the Bitrix REST API in live mode', async () => {
    const bitrix = createFakeBitrix()
    const live = await startApp({ disk: () => createLiveDisk({ webhookUrl: FAKE_WEBHOOK, fetchImpl: bitrix.fetchImpl }) })
    try {
      const query = new URLSearchParams({ title: 'Паспорт', fileName: 'Паспорт.pdf', mimeType: 'application/pdf' })
      const created = await live.upload(`/api/personnel/p-2/documents?${query}`, 'POST', '%PDF-live')
      assert.equal(created.status, 201)
      const worker = ((await created.json()) as { item: Worker }).item
      assert.equal(worker.documents[0].storagePath, `ERP/Персонал/${worker.fullName}/Паспорт.pdf`)
      const stored = [...bitrix.objects.values()].find((o) => o.NAME === 'Паспорт.pdf')
      assert.equal(stored?.content?.toString(), '%PDF-live')
      assert.equal((await live.call('GET', `/api/personnel/p-2/documents/${worker.documents[0].id}/file`)).text, '%PDF-live')
      assert.equal((await live.call('DELETE', `/api/personnel/p-2/documents/${worker.documents[0].id}`)).status, 200)
      assert.equal(stored?.DELETED_TYPE, '3', 'moved to the Bitrix trash, not erased')
    } finally {
      await live.close()
    }
  })
})

describe('storage', () => {
  it('keeps data across a restart and seeds only an empty database', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'erp-db-'))
    const file = path.join(dir, 'erp.sqlite')
    try {
      const firstDb = openDatabase(file)
      const first = await startApp({ db: firstDb })
      const created = await first.call('POST', '/api/personnel', 'admin', { fullName: 'Сохранов Пётр', position: 'Рабочий', phone: '', hiredAt: '', note: '' })
      const id = created.json.item.id as string
      const doc = await first.upload(`/api/personnel/${id}/documents?title=Паспорт&fileName=p.pdf&mimeType=application%2Fpdf`, 'POST', '%PDF-keep')
      const docId = ((await doc.json()) as { item: Worker }).item.documents[0].id
      await first.close()
      firstDb.close()

      const secondDb = openDatabase(file)
      const second = await startApp({ db: secondDb })
      try {
        const workers = (await second.call('GET', '/api/personnel')).json.items as Worker[]
        assert.equal(workers.length, 31)
        assert.equal(workers.filter((w) => w.id === id).length, 1)
        assert.equal((await second.call('GET', `/api/personnel/${id}/documents/${docId}/file`)).text, '%PDF-keep')
      } finally {
        await second.close()
        secondDb.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('starts empty without demo data when seeding is off', async () => {
    const empty = await startApp({ seed: undefined })
    try {
      assert.deepEqual((await empty.call('GET', '/api/personnel')).json.items, [])
      assert.deepEqual((await empty.call('GET', '/api/contracts')).json.items, [])
      const training = (await empty.call('GET', '/api/training/directions')).json.items as unknown[]
      assert.ok(training.length > 0, 'the training catalogue is reference data')
    } finally {
      await empty.close()
    }
  })

  it('registers equipment to the signed-in user in an empty database', async () => {
    const empty = await startApp({ seed: undefined, devLogin: false, admin: { login: 'root', password: 'корневой-пароль' } })
    try {
      const response = await fetch(`${empty.base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: 'root', password: 'корневой-пароль' }),
      })
      const root = { cookie: sessionCookie(response) }
      const state = (await empty.call('GET', '/api/equipment/state', root)).json as EquipmentState
      assert.equal(state.persona.fullName, 'Администратор')
      assert.deepEqual(state.people.map((p) => p.id), [state.persona.id])
      assert.deepEqual(state.warehouses.map((w) => w.slug), ['repair'])
      assert.deepEqual(state.items, [])

      const draft = { name: 'Насос', type: 'CONSUMABLE', quantity: 2, condition: 'OK', ownerType: 'USER', ownerUserId: state.persona.id }
      const created = await empty.call('POST', '/api/equipment', root, draft)
      assert.equal(created.status, 201, created.text)
      const stranger = await empty.call('POST', '/api/equipment', root, { ...draft, ownerUserId: 'u-unknown' })
      assert.equal(stranger.status, 404)
    } finally {
      await empty.close()
    }
  })
})
