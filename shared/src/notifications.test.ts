import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { EquipmentItem, EquipmentPerson, Transfer } from './equipment.js'
import {
  EQUIPMENT_NEEDS_FIX_NOTIFICATION_ID,
  EQUIPMENT_PENDING_REVIEW_NOTIFICATION_ID,
  NOTIFICATION_TYPE,
  buildEquipmentNotifications,
  equipmentIncomingNotificationId,
} from './notifications.js'

const master: EquipmentPerson = { id: 'u-master', fullName: 'Мастер', role: 'master', warehouseIds: [] }
const keeper: EquipmentPerson = { id: 'u-keeper', fullName: 'Кладовщик', role: 'storekeeper', warehouseIds: ['wh-1'] }
const admin: EquipmentPerson = { id: 'u-admin', fullName: 'Админ', role: 'admin', warehouseIds: [] }

function item(patch: Partial<EquipmentItem> = {}): EquipmentItem {
  return {
    id: 'eq-1',
    name: 'Насос',
    factoryNumber: 'N-1',
    quantity: 1,
    type: 'SERIAL',
    condition: 'OK',
    hasDocuments: false,
    documents: [],
    category: 'EQUIPMENT',
    ownerType: 'USER',
    ownerUserId: 'u-other',
    ownerWarehouseId: null,
    fillStatus: 'OK',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  }
}

function transfer(equipmentId: string, patch: Partial<Transfer> = {}): Transfer {
  return {
    id: `tr-${equipmentId}`,
    equipmentId,
    equipmentName: 'Насос',
    quantity: 1,
    status: 'PENDING',
    fromOwnerType: 'USER',
    fromUserId: 'u-other',
    fromLabel: 'Другой',
    toOwnerType: 'USER',
    toUserId: 'u-master',
    toLabel: 'Мастер',
    actorUserId: 'u-other',
    actorName: 'Другой',
    createdAt: '2026-10-01T12:00:00.000Z',
    ...patch,
  }
}

describe('buildEquipmentNotifications', () => {
  it('emits one incoming notification per position with stable id and copy', () => {
    const pump = item({ id: 'eq-pump', name: 'Насос', pendingTransferId: 'tr-eq-pump' })
    const drill = item({
      id: 'eq-drill',
      name: 'Дрель',
      pendingTransferId: 'tr-eq-drill',
      category: 'VEHICLE',
      plateNumber: 'A123BC77',
    })
    const list = buildEquipmentNotifications({
      persona: master,
      permissions: ['view_own', 'transfer'],
      items: [pump, drill, item({ id: 'eq-other', pendingTransferId: 'tr-other' })],
      transfers: [
        transfer('eq-pump', { id: 'tr-eq-pump', quantity: 2 }),
        transfer('eq-drill', {
          id: 'tr-eq-drill',
          equipmentName: 'Дрель',
          createdAt: '2026-10-02T12:00:00.000Z',
        }),
        transfer('eq-other', { id: 'tr-other', toUserId: 'u-someone-else', toLabel: 'Чужой' }),
      ],
    })

    const incoming = list.filter((n) => n.type === NOTIFICATION_TYPE.EQUIPMENT_INCOMING)
    assert.equal(incoming.length, 2)
    assert.deepEqual(
      incoming.map((n) => n.id).sort(),
      [equipmentIncomingNotificationId('eq-drill'), equipmentIncomingNotificationId('eq-pump')].sort(),
    )

    const pumpNote = incoming.find((n) => n.entityIds[0] === 'eq-pump')
    assert.ok(pumpNote)
    assert.equal(pumpNote.title, 'Ждёт принятия: Насос')
    assert.equal(pumpNote.body, 'от Другой, 2 шт. → Мастер')
    assert.equal(pumpNote.deepLink, '/equipment/mine')
    assert.equal(pumpNote.tone, 'warn')
    assert.equal(pumpNote.priority, 1)

    const drillNote = incoming.find((n) => n.entityIds[0] === 'eq-drill')
    assert.ok(drillNote)
    assert.equal(drillNote.title, 'Ждёт принятия: Дрель (A123BC77)')
  })

  it('deep-links warehouse incoming to the base page', () => {
    const list = buildEquipmentNotifications({
      persona: keeper,
      permissions: ['view_own', 'transfer'],
      items: [item({ id: 'eq-wh', pendingTransferId: 'tr-wh' })],
      transfers: [
        transfer('eq-wh', {
          id: 'tr-wh',
          toOwnerType: 'WAREHOUSE',
          toUserId: undefined,
          toWarehouseId: 'wh-1',
          toLabel: 'Север',
        }),
      ],
    })
    assert.equal(list.length, 1)
    assert.equal(list[0]?.deepLink, '/equipment/warehouses/wh-1')
  })

  it('emits one needs_fix summary for own flagged cards', () => {
    const list = buildEquipmentNotifications({
      persona: master,
      permissions: ['view_own', 'edit'],
      items: [
        item({
          id: 'fix-1',
          name: 'А',
          ownerUserId: 'u-master',
          fillStatus: 'NEEDS_FIX',
          updatedAt: '2026-10-05T00:00:00.000Z',
        }),
        item({
          id: 'fix-2',
          name: 'Б',
          ownerUserId: 'u-master',
          fillStatus: 'NEEDS_FIX',
          updatedAt: '2026-10-06T00:00:00.000Z',
        }),
        item({ id: 'fix-other', ownerUserId: 'u-other', fillStatus: 'NEEDS_FIX' }),
      ],
      transfers: [],
    })
    assert.equal(list.length, 1)
    const note = list[0]
    assert.ok(note)
    assert.equal(note.id, EQUIPMENT_NEEDS_FIX_NOTIFICATION_ID)
    assert.equal(note.type, NOTIFICATION_TYPE.EQUIPMENT_NEEDS_FIX)
    assert.equal(note.title, 'Неверно заполнены: 2 позиции')
    assert.match(note.body, /замечанию/)
    assert.equal(note.deepLink, '/equipment/mine')
    assert.equal(note.tone, 'bad')
    assert.equal(note.priority, 2)
    assert.deepEqual(note.entityIds, ['fix-1', 'fix-2'])
    assert.equal(note.createdAt, '2026-10-06T00:00:00.000Z')
  })

  it('emits one pending_review summary for reviewers', () => {
    const list = buildEquipmentNotifications({
      persona: admin,
      permissions: ['view_all', 'edit_all', 'review_fill'],
      items: [
        item({ id: 'rev-1', name: 'Компрессор', fillStatus: 'PENDING_REVIEW' }),
        item({ id: 'rev-2', name: 'Генератор', fillStatus: 'PENDING_REVIEW' }),
        item({ id: 'fix', fillStatus: 'NEEDS_FIX', ownerUserId: 'u-master' }),
      ],
      transfers: [],
    })
    assert.equal(list.length, 1)
    const note = list[0]
    assert.ok(note)
    assert.equal(note.id, EQUIPMENT_PENDING_REVIEW_NOTIFICATION_ID)
    assert.equal(note.title, 'Ждут проверки заполнения: 2 позиции')
    assert.equal(note.body, 'Откройте список оборудования и подтвердите заполнение карточек.')
    assert.equal(note.deepLink, '/equipment')
    assert.equal(note.tone, 'info')
    assert.equal(note.priority, 3)
  })

  it('sorts by priority then newest first', () => {
    const list = buildEquipmentNotifications({
      persona: { ...admin, warehouseIds: [] },
      permissions: ['view_all', 'edit_all', 'review_fill', 'transfer'],
      items: [
        item({
          id: 'fix-me',
          ownerUserId: 'u-admin',
          fillStatus: 'NEEDS_FIX',
          updatedAt: '2026-10-01T00:00:00.000Z',
        }),
        item({ id: 'rev', fillStatus: 'PENDING_REVIEW', updatedAt: '2026-10-03T00:00:00.000Z' }),
        item({ id: 'in', pendingTransferId: 'tr-in', ownerUserId: 'u-other' }),
      ],
      transfers: [transfer('in', { id: 'tr-in', toUserId: 'u-admin', toLabel: 'Админ', createdAt: '2026-10-02T00:00:00.000Z' })],
    })
    assert.deepEqual(
      list.map((n) => n.type),
      [
        NOTIFICATION_TYPE.EQUIPMENT_INCOMING,
        NOTIFICATION_TYPE.EQUIPMENT_NEEDS_FIX,
        NOTIFICATION_TYPE.EQUIPMENT_PENDING_REVIEW,
      ],
    )
  })

  it('returns an empty list when nothing matches', () => {
    assert.deepEqual(
      buildEquipmentNotifications({
        persona: master,
        permissions: ['view_own'],
        items: [item({ ownerUserId: 'u-master', fillStatus: 'OK' })],
        transfers: [],
      }),
      [],
    )
  })
})
