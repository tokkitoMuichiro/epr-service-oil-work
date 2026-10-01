import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { createApp, type AppOptions } from './app.js'
import { openDatabase } from './db.js'
import {
  validateBrigadeDraft,
  type AssignmentIssue,
  type Brigade,
  type BrigadeAssignment,
  type Contract,
  type EquipmentState,
  type ObjectCrew,
  type RoleId,
  type User,
  type Worker,
} from './shared.js'

const TODAY = '2026-09-29'

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
  const server: Server = createApp({ today: () => TODAY, devLogin: true, ...options }).listen(0, '127.0.0.1')
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

  function upload(url: string, method: string, body: string, who: Who = 'admin') {
    return raw(method, url, who, { headers: { 'Content-Type': 'application/octet-stream' }, body })
  }

  async function close() {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
  }

  return { base, call, upload, close }
}

type Api = Awaited<ReturnType<typeof startApp>>

let api: Api
let call: Api['call']
let upload: Api['upload']

before(async () => {
  api = await startApp()
  call = api.call
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
    assert.equal(contracts.length, 6)
    assert.equal(contracts.flatMap((c) => c.objects).length, 20)
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

  it('edits the position requirement matrix with settings_manage only', async () => {
    const view = (await call('GET', '/api/qualifications', 'master')).json.item
    assert.ok(view.types.length >= 10)
    assert.ok(view.requirements.some((r: { position: string }) => r.position === 'Мастер'))
    const next = [...view.requirements, { position: 'Водитель', qualificationTypeIds: ['first_aid'] }]
    assert.equal((await call('PUT', '/api/qualifications/requirements', 'office', { requirements: next })).status, 403)
    assert.equal(
      (await call('PUT', '/api/qualifications/requirements', 'admin', { requirements: [{ position: 'X', qualificationTypeIds: ['fly'] }] })).status,
      400,
    )
    const saved = await call('PUT', '/api/qualifications/requirements', 'admin', { requirements: next })
    assert.equal(saved.status, 200)
    assert.ok(saved.json.items.some((r: { position: string }) => r.position === 'Водитель'))
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

    assert.equal((await call('GET', '/api/equipment/export.xls', 'office')).status, 403)
    const xls = await call('GET', '/api/equipment/export.xls', 'admin')
    assert.equal(xls.status, 200)
    assert.match(xls.headers.get('content-type') ?? '', /ms-excel/)
    assert.match(xls.text, /<Workbook/)
    assert.match(xls.text, /Транспорт/)
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
      ownerUserId: 'u-admin',
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
      toUserId: 'u-master-ivanov',
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
    const free = state.items.filter((i) => i.ownerUserId === 'u-master-ivanov' && !i.pendingTransferId && i.fillStatus === 'OK')
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
    const wh = await call('POST', '/api/equipment/warehouses', 'storekeeper', { name: 'База Восток', keeperIds: ['u-keeper'] })
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
})

describe('authentication', () => {
  it('ignores the role header: no session means 401, the header never grants PII', async () => {
    const anonymous = await call('GET', '/api/personnel', null, undefined, { 'x-erp-role': 'admin' })
    assert.equal(anonymous.status, 401)
    const spoofed = await call('GET', '/api/personnel', 'office', undefined, { 'x-erp-role': 'admin' })
    assert.equal(spoofed.status, 200)
    assert.ok((spoofed.json.items as Worker[]).every((w) => w.pii === null))
    const session = await call('GET', '/api/auth/session', null)
    assert.deepEqual(session.json.item, { user: null, devLogin: true })
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

describe('training', () => {
  let training: Api

  before(async () => {
    training = await startApp({ publicUrl: 'https://erp.example' })
  })

  after(async () => {
    await training.close()
  })

  async function phoneLast4Of(workerId: string): Promise<string> {
    const worker = (await training.call('GET', `/api/personnel/${workerId}`)).json.item as Worker
    return worker.phone.replace(/\D/g, '').slice(-4)
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

  async function verified(token: string, digits: string): Promise<{ cookie: string }> {
    const response = await fetch(`${training.base}/api/public/test/${token}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneLast4: digits }),
    })
    assert.equal(response.status, 200)
    const match = /erp_test=[^;]+/.exec(response.headers.get('set-cookie') ?? '')
    assert.ok(match, 'test session cookie is set')
    return { cookie: match[0] }
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
    assert.match(created.message, /последние 4 цифры вашего телефона/)
    const token = tokenOf(created.link)
    const digits = await phoneLast4Of('p-4')

    const view = await training.call('GET', `/api/public/test/${token}`, null)
    assert.equal(view.status, 200)
    assert.equal(view.json.item.isVerified, false)
    assert.ok(!view.text.includes(digits), 'the phone is never returned')
    assert.equal((await training.call('POST', `/api/public/test/${token}/start`, null)).status, 403)

    const wrong = String((Number(digits) + 1) % 10000).padStart(4, '0')
    assert.equal((await training.call('POST', `/api/public/test/${token}/verify`, null, { phoneLast4: wrong })).status, 400)

    const session = await verified(token, digits)
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

    const certs = (await training.call('GET', '/api/training/workers/p-4/certifications')).json.item
    const fire = certs.statuses.find((s: { programId: string }) => s.programId === 'pr-fire')
    assert.equal(fire.state, 'valid')
  })

  it('locks the link after five wrong phone digits', async () => {
    const [created] = (await assign(['p-9'])).json.created
    const token = tokenOf(created.link)
    const digits = await phoneLast4Of('p-9')
    const wrong = String((Number(digits) + 1) % 10000).padStart(4, '0')
    for (let i = 0; i < 4; i += 1) {
      assert.equal((await training.call('POST', `/api/public/test/${token}/verify`, null, { phoneLast4: wrong })).status, 400)
    }
    assert.equal((await training.call('POST', `/api/public/test/${token}/verify`, null, { phoneLast4: wrong })).status, 423)
    assert.equal((await training.call('POST', `/api/public/test/${token}/verify`, null, { phoneLast4: digits })).status, 423)
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
    const empty = await startApp({ seedDemo: false })
    try {
      assert.deepEqual((await empty.call('GET', '/api/personnel')).json.items, [])
      assert.deepEqual((await empty.call('GET', '/api/contracts')).json.items, [])
    } finally {
      await empty.close()
    }
  })
})
