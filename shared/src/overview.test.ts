import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Contract, ContractObject, WorkItem } from './contracts.js'
import type { EquipmentItem, EquipmentPerson, Transfer } from './equipment.js'
import {
  documentOverview,
  equipmentOverview,
  isLagging,
  laggingObjects,
  missingReports,
  overviewObjects,
  overviewWindow,
  upcomingEvents,
  volumeProgress,
  type OverviewObject,
} from './overview.js'
import type { Worker, WorkerDocument } from './personnel.js'
import type { ReportDay } from './reports.js'

const TODAY = '2026-10-13'

function work(patch: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'w-1',
    title: 'Монтаж',
    unit: 'м',
    plannedVolume: 100,
    actualVolume: 0,
    plannedStart: '2026-10-01',
    plannedEnd: '2026-10-20',
    status: 'in_progress',
    ...patch,
  }
}

function object(patch: Partial<ContractObject> = {}): ContractObject {
  return {
    id: 'o-1',
    name: 'РВС-5000 №1',
    location: 'НПС',
    plannedStart: '2026-10-01',
    plannedEnd: '2026-10-20',
    actualStart: '2026-10-01',
    works: [work()],
    deadlineEdits: [],
    ...patch,
  }
}

function contract(objects: ContractObject[], patch: Partial<Contract> = {}): Contract {
  return { id: 'c-1', name: 'Договор №1', customer: 'Заказчик', year: 2026, objects, ...patch }
}

function summary(patch: Partial<OverviewObject> = {}): OverviewObject {
  return {
    contractId: 'c-1',
    contractName: 'Договор №1',
    objectId: 'o-1',
    name: 'Объект',
    location: '',
    plannedStart: '2026-10-01',
    plannedEnd: '2026-10-30',
    actualStart: '2026-10-01',
    state: 'in_progress',
    progress: null,
    lastReport: null,
    reportDays: [],
    ...patch,
  }
}

describe('volumeProgress', () => {
  it('compares expected and actual share with equal weight per work', () => {
    const works = [work({ id: 'a', actualVolume: 50 }), work({ id: 'b', plannedVolume: 10, actualVolume: 10 })]
    assert.deepEqual(volumeProgress(works, {}, '2026-10-10'), { expected: 50, actual: 75 })
  })

  it('takes the larger of entered volume and reported total, capped at 100 %', () => {
    assert.deepEqual(volumeProgress([work({ actualVolume: 10 })], { 'w-1': 30 }, '2026-10-10'), { expected: 50, actual: 30 })
    assert.deepEqual(volumeProgress([work()], { 'w-1': 500 }, '2026-10-10'), { expected: 50, actual: 100 })
  })

  it('skips works without planned volume or dates', () => {
    assert.equal(volumeProgress([work({ plannedVolume: 0 }), work({ plannedEnd: '' })], {}, TODAY), null)
  })
})

describe('overviewWindow', () => {
  it('covers the Monday–Sunday week that contains today', () => {
    // 2026-10-13 is a Tuesday → week 2026-10-12 … 2026-10-18
    assert.deepEqual(overviewWindow(TODAY), { from: '2026-10-12', to: '2026-10-18' })
    assert.deepEqual(overviewWindow('2026-10-12'), { from: '2026-10-12', to: '2026-10-18' })
    assert.deepEqual(overviewWindow('2026-10-18'), { from: '2026-10-12', to: '2026-10-18' })
  })
})

describe('overviewObjects', () => {
  const reportDays: ReportDay[] = [
    { objectId: 'o-1', date: '2026-09-20', workIds: ['w-1'], volumes: { 'w-1': 10 } },
    { objectId: 'o-1', date: '2026-10-12', workIds: ['w-1'], volumes: { 'w-1': 20 } },
    { objectId: 'o-1', date: '2026-10-14', workIds: ['w-1'], volumes: { 'w-1': 99 } },
  ]

  it('keeps active objects and sums reported volume up to today', () => {
    const contracts = [
      contract([object(), object({ id: 'o-done', actualEnd: '2026-10-10' }), object({ id: 'o-arch', archived: true })]),
      contract([object({ id: 'o-other' })], { id: 'c-2', archived: true }),
    ]
    const [item, ...rest] = overviewObjects(contracts, reportDays, TODAY)
    assert.equal(rest.length, 0)
    assert.equal(item.objectId, 'o-1')
    assert.equal(item.lastReport, '2026-10-12')
    assert.deepEqual(item.reportDays, ['2026-10-12'])
    assert.deepEqual(item.progress, { expected: 65, actual: 30 })
    assert.equal(item.state, 'in_progress')
  })
})

describe('lagging objects', () => {
  it('flags late starts, overdue objects and volume lag of 10 points', () => {
    assert.equal(isLagging(summary({ state: 'late_start' })), true)
    assert.equal(isLagging(summary({ progress: { expected: 50, actual: 41 } })), false)
    assert.equal(isLagging(summary({ progress: { expected: 50, actual: 40 } })), true)
  })

  it('puts overdue first, then late start, then by lag', () => {
    const list = laggingObjects([
      summary({ objectId: 'small', progress: { expected: 50, actual: 35 } }),
      summary({ objectId: 'late', state: 'late_start' }),
      summary({ objectId: 'big', progress: { expected: 80, actual: 20 } }),
      summary({ objectId: 'over', state: 'overdue' }),
      summary({ objectId: 'fine' }),
    ])
    assert.deepEqual(list.map((o) => o.objectId), ['over', 'late', 'big', 'small'])
  })
})

describe('missingReports', () => {
  it('lists objects in work without a report for yesterday or today', () => {
    const list = missingReports(
      [
        summary({ objectId: 'yesterday', lastReport: '2026-10-12' }),
        summary({ objectId: 'old', lastReport: '2026-10-01' }),
        summary({ objectId: 'never' }),
        summary({ objectId: 'started-today', actualStart: TODAY }),
        summary({ objectId: 'not-started', actualStart: undefined }),
      ],
      TODAY,
    )
    assert.deepEqual(list.map((o) => o.objectId), ['never', 'old'])
  })
})

describe('upcomingEvents', () => {
  it('lists planned starts and finishes within two weeks', () => {
    const events = upcomingEvents(
      [
        summary({ objectId: 'starts', actualStart: undefined, plannedStart: '2026-10-20', plannedEnd: '2026-12-01' }),
        summary({ objectId: 'ends', plannedEnd: '2026-10-15' }),
        summary({ objectId: 'far', actualStart: undefined, plannedStart: '2026-11-20', plannedEnd: '2026-12-01' }),
        summary({ objectId: 'past', plannedEnd: '2026-10-01' }),
      ],
      TODAY,
    )
    assert.deepEqual(
      events.map((e) => [e.date, e.kind, e.object.objectId]),
      [
        ['2026-10-15', 'finish', 'ends'],
        ['2026-10-20', 'start', 'starts'],
      ],
    )
  })
})

describe('equipmentOverview', () => {
  const persona: EquipmentPerson = { id: 'u-1', fullName: 'Мастер', role: 'master', warehouseIds: ['wh-1'] }

  function item(patch: Partial<EquipmentItem>): EquipmentItem {
    return {
      id: 'eq',
      name: 'Насос',
      factoryNumber: 'N',
      quantity: 1,
      type: 'SERIAL',
      condition: 'OK',
      hasDocuments: false,
      documents: [],
      category: 'EQUIPMENT',
      ownerType: 'USER',
      ownerUserId: 'u-1',
      ownerWarehouseId: null,
      fillStatus: 'OK',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...patch,
    }
  }

  function incoming(equipmentId: string, patch: Partial<Transfer>): Transfer {
    return {
      id: `tr-${equipmentId}`,
      equipmentId,
      equipmentName: 'Насос',
      quantity: 1,
      status: 'PENDING',
      fromOwnerType: 'USER',
      fromUserId: 'u-2',
      fromLabel: 'Другой',
      toOwnerType: 'USER',
      toUserId: 'u-1',
      toLabel: 'Мастер',
      actorUserId: 'u-2',
      actorName: 'Другой',
      createdAt: '2026-10-01T00:00:00.000Z',
      ...patch,
    }
  }

  it('counts incoming transfers, repairs and cards to fix', () => {
    const counts = equipmentOverview({
      persona,
      permissions: ['view_own'],
      items: [
        item({ id: 'to-me', ownerUserId: 'u-2', pendingTransferId: 'tr-to-me' }),
        item({ id: 'to-base', ownerUserId: 'u-2', pendingTransferId: 'tr-to-base' }),
        item({ id: 'to-other', ownerUserId: 'u-2', pendingTransferId: 'tr-to-other' }),
        item({ id: 'broken', condition: 'NEEDS_REPAIR' }),
        item({ id: 'fix', fillStatus: 'NEEDS_FIX' }),
        item({ id: 'fix-other', fillStatus: 'NEEDS_FIX', ownerUserId: 'u-3' }),
      ],
      transfers: [
        incoming('to-me', {}),
        incoming('to-base', { toOwnerType: 'WAREHOUSE', toUserId: undefined, toWarehouseId: 'wh-1' }),
        incoming('to-other', { toUserId: 'u-3' }),
      ],
    })
    assert.deepEqual(counts, { incoming: 2, needsRepair: 1, needsFix: 1, pendingReview: 0 })
  })
})

describe('documentOverview', () => {
  function doc(expiresAt?: string): WorkerDocument {
    return { id: expiresAt ?? 'none', title: 'Удостоверение', fileName: 'a.pdf', mimeType: 'application/pdf', size: 1, uploadedAt: '2026-01-01', expiresAt }
  }

  function worker(id: string, documents: WorkerDocument[], employment: Worker['employment'] = 'active'): Pick<Worker, 'id' | 'fullName' | 'employment' | 'documents'> {
    return { id, fullName: id, employment, documents }
  }

  it('reports the most urgent document per working employee', () => {
    const result = documentOverview(
      [
        worker('expired', [doc('2026-12-31'), doc('2026-10-01')]),
        worker('expiring', [doc('2026-10-30')]),
        worker('valid', [doc('2027-06-01'), doc()]),
        worker('fired', [doc('2026-01-01')], 'fired'),
      ],
      TODAY,
    )
    assert.equal(result.expired, 1)
    assert.equal(result.expiring, 1)
    assert.deepEqual(
      result.alerts.map((a) => [a.workerId, a.state, a.expiresAt]),
      [
        ['expired', 'expired', '2026-10-01'],
        ['expiring', 'expiring', '2026-10-30'],
      ],
    )
  })
})
