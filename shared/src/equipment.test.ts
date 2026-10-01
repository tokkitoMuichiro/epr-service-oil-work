import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ROLE_PERMISSIONS,
  buildAuth,
  canAcceptTransfer,
  canBrowse,
  canCancelPendingTransfer,
  canChangeCondition,
  canConfirmFill,
  canCreate,
  canCreateFor,
  canDeleteItem,
  canEditDocuments,
  canEditItem,
  canExport,
  canFlagFill,
  canSeeFillComment,
  canStockWarehouse,
  canTransferItem,
  canViewAllList,
  identityLabel,
  isValidPlate,
  matchesEquipmentQuery,
  mergeEquipmentPatch,
  normalizeConditionNote,
  normalizeEquipmentFields,
  normalizePlate,
  positionsLabel,
  repairOrigin,
  sortEquipment,
  validateEquipmentDraft,
  validateEquipmentPatch,
  withKeeperWarehouses,
  type DemoPerson,
  type EquipmentItem,
  type Transfer,
  type Warehouse,
} from './equipment.js'

const people: DemoPerson[] = [
  { id: 'u-admin', fullName: 'Админ', roleSlug: 'admin', warehouseIds: [] },
  { id: 'u-master', fullName: 'Мастер', roleSlug: 'master', warehouseIds: [] },
  { id: 'u-keeper', fullName: 'Кладовщик', roleSlug: 'keeper', warehouseIds: ['wh-north'] },
  { id: 'u-office', fullName: 'Офис', roleSlug: 'office', warehouseIds: [] },
]

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
    ownerUserId: 'u-master',
    ownerWarehouseId: null,
    fillStatus: 'OK',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  }
}

const pending: Transfer = {
  id: 'tr-1',
  equipmentId: 'eq-1',
  equipmentName: 'Насос',
  quantity: 1,
  status: 'PENDING',
  fromOwnerType: 'USER',
  fromUserId: 'u-master',
  fromLabel: 'Мастер',
  toOwnerType: 'WAREHOUSE',
  toWarehouseId: 'wh-north',
  toLabel: 'Север',
  actorUserId: 'u-master',
  actorName: 'Мастер',
  createdAt: '2026-01-02T00:00:00.000Z',
}

const admin = buildAuth('admin', people)
const master = buildAuth('master', people)
const keeper = buildAuth('storekeeper', people)
const office = buildAuth('office', people)

describe('equipment permissions', () => {
  it('maps roles to demo personas', () => {
    assert.equal(master.user.id, 'u-master')
    assert.equal(keeper.user.id, 'u-keeper')
  })

  it('derives keeper bases from warehouses', () => {
    const warehouses: Warehouse[] = [
      { id: 'wh-1', name: 'Север', slug: 'n', isSystem: false, keeperIds: ['u-1'] },
      { id: 'wh-2', name: 'Юг', slug: 's', isSystem: false, keeperIds: [] },
    ]
    const [person] = withKeeperWarehouses([{ id: 'u-1', fullName: 'Кладовщик', roleSlug: 'keeper' }], warehouses)
    assert.deepEqual(person.warehouseIds, ['wh-1'])
  })

  it('lets everyone browse, but only view_all opens the full list', () => {
    assert.equal(canBrowse(master), true)
    assert.equal(canViewAllList(master), false)
    assert.equal(canViewAllList(office), true)
    assert.equal(canCreate(office), false)
    assert.equal(canTransferItem(office, item(), []), false)
  })

  it('blocks transfers and condition changes while a transfer is pending', () => {
    const inTransit = item({ pendingTransferId: 'tr-1' })
    assert.equal(canTransferItem(master, item(), []), true)
    assert.equal(canTransferItem(master, inTransit, [pending]), false)
    assert.equal(canChangeCondition(master, inTransit, [pending]), false)
    assert.equal(canDeleteItem(admin, inTransit, [pending]), false)
  })

  it('lets only the recipient accept and the sender cancel', () => {
    const inTransit = item({ pendingTransferId: 'tr-1' })
    assert.equal(canAcceptTransfer(keeper, inTransit, [pending]), true)
    assert.equal(canAcceptTransfer(master, inTransit, [pending]), false)
    assert.equal(canCancelPendingTransfer(master, inTransit, [pending]), true)
    assert.equal(canCancelPendingTransfer(office, inTransit, [pending]), false)
  })

  it('restricts transfers from a base to its keeper', () => {
    const onBase = item({ ownerType: 'WAREHOUSE', ownerUserId: null, ownerWarehouseId: 'wh-north' })
    assert.equal(canTransferItem(keeper, onBase, []), true)
    assert.equal(canTransferItem(master, onBase, []), false)
    assert.equal(canTransferItem(keeper, { ...onBase, ownerWarehouseId: 'wh-repair' }, []), false)
  })

  it('handles fill review: blocks transfer, lets the owner fix the card', () => {
    const flagged = item({ fillStatus: 'NEEDS_FIX' })
    assert.equal(canTransferItem(admin, flagged, []), false)
    assert.equal(canEditItem(master, flagged), true)
    assert.equal(canEditItem(buildAuth('master', people, { ...ROLE_PERMISSIONS, master: [] }), item()), false)
    assert.equal(canFlagFill(admin, item(), []), true)
    assert.equal(canFlagFill(keeper, item(), []), false)
    assert.equal(canConfirmFill(admin, flagged), true)
    assert.equal(canConfirmFill(admin, item()), false)
    assert.equal(canSeeFillComment(master, flagged), true)
    assert.equal(canSeeFillComment(office, flagged), false)
  })

  it('has no conditions or documents for cards', () => {
    const card = item({ category: 'CARD', cardKind: 'FUEL', cardNumber: '7788' })
    assert.equal(canChangeCondition(admin, card, []), false)
    assert.equal(canEditDocuments(admin, card), false)
    assert.equal(canEditDocuments(master, item()), true)
  })

  it('limits assignment of new items to yourself or your base', () => {
    const own = { condition: 'OK' as const, ownerType: 'USER' as const, ownerUserId: 'u-master' }
    assert.equal(canCreateFor(master, own), true)
    assert.equal(canCreateFor(master, { ...own, ownerUserId: 'u-admin' }), false)
    assert.equal(canCreateFor(master, { ...own, ownerUserId: 'u-admin', condition: 'IN_REPAIR' }), true)
    assert.equal(canCreateFor(keeper, { ...own, ownerUserId: 'u-admin' }), true)
    assert.equal(canStockWarehouse(master, 'wh-north'), false)
    assert.equal(canStockWarehouse(keeper, 'wh-south'), true)
  })

  it('restricts Excel export to admin', () => {
    assert.equal(canExport(admin), true)
    assert.equal(canExport(keeper), false)
  })

  it('gives fill review to a role without making it privileged', () => {
    const reviewer = buildAuth('storekeeper', people, {
      ...ROLE_PERMISSIONS,
      storekeeper: [...ROLE_PERMISSIONS.storekeeper, 'review_fill'],
    })
    assert.equal(canFlagFill(reviewer, item(), []), true)
    assert.equal(canEditItem(reviewer, item()), false)
  })
})

describe('equipment draft validation', () => {
  const base = { name: 'Насос', condition: 'OK' as const, ownerType: 'USER' as const, ownerUserId: 'u-master' }

  it('requires a factory number for serial items', () => {
    assert.match(validateEquipmentDraft({ ...base, type: 'SERIAL', quantity: 1 }) ?? '', /заводской/)
    assert.equal(validateEquipmentDraft({ ...base, type: 'SERIAL', quantity: 1, factoryNumber: 'N-2' }), null)
  })

  it('requires a positive quantity for consumables', () => {
    assert.match(validateEquipmentDraft({ ...base, type: 'CONSUMABLE', quantity: 0 }) ?? '', /Количество/)
  })

  it('requires a note for broken states and skips the owner for repair', () => {
    const broken = { ...base, type: 'SERIAL' as const, quantity: 1, factoryNumber: 'N', condition: 'NEEDS_REPAIR' as const }
    assert.match(validateEquipmentDraft(broken) ?? '', /пояснение/)
    assert.equal(validateEquipmentDraft({ ...broken, conditionNote: 'Течёт сальник' }), null)
    assert.equal(
      validateEquipmentDraft({ ...broken, condition: 'IN_REPAIR', conditionNote: 'Подшипник', ownerUserId: '' }),
      null,
    )
    assert.deepEqual(normalizeConditionNote('OK', 'старое'), { note: null })
  })

  it('validates vehicles by plate format', () => {
    const vehicle = { ...base, category: 'VEHICLE' as const, name: 'ГАЗель', vehicleKind: 'TRUCK' as const }
    assert.match(validateEquipmentDraft({ ...vehicle, plateNumber: '123' }) ?? '', /госномер/)
    assert.equal(validateEquipmentDraft({ ...vehicle, plateNumber: 'а 123 вс 77' }), null)
    assert.equal(isValidPlate('АВ1234 199', 'TRAILER'), true)
    assert.equal(isValidPlate('А123ВС77', 'TRAILER'), false)
    assert.equal(normalizePlate('а 123-вс 77'), 'A123BC77')
    const fields = normalizeEquipmentFields({ ...vehicle, plateNumber: 'а 123 вс 77' })
    assert.equal(fields.plateNumber, 'A123BC77')
    assert.equal(fields.factoryNumber, 'A123BC77')
    assert.equal(fields.quantity, 1)
  })

  it('validates cards and builds default names', () => {
    const card = { ...base, category: 'CARD' as const, name: '', condition: undefined }
    assert.match(validateEquipmentDraft({ ...card, cardKind: 'BUSINESS', cardNumber: '12' }) ?? '', /4 цифры/)
    assert.match(validateEquipmentDraft({ ...card, cardKind: 'TRANSPONDER', cardNumber: 'T-1' }) ?? '', /транспондера/)
    assert.equal(validateEquipmentDraft({ ...card, cardKind: 'FUEL', cardNumber: '7001' }), null)
    const fields = normalizeEquipmentFields({ ...card, cardKind: 'BUSINESS', cardNumber: '**** 4455' })
    assert.equal(fields.cardNumber, '4455')
    assert.equal(fields.name, 'Бизнес-карта ****4455')
    assert.equal(identityLabel(item({ category: 'CARD', cardKind: 'BUSINESS', cardNumber: '4455' })), '****4455')
  })

  it('validates edits against the merged card', () => {
    const serial = item()
    assert.equal(validateEquipmentPatch(serial, { name: 'Насос НЦ' }), null)
    assert.match(validateEquipmentPatch(serial, { factoryNumber: ' ' }) ?? '', /заводской/)
    assert.equal(mergeEquipmentPatch(item({ category: 'VEHICLE' }), { type: 'CONSUMABLE' }).type, 'SERIAL')
  })
})

describe('equipment lists', () => {
  it('searches by name, number and plate in any script', () => {
    const vehicle = item({ category: 'VEHICLE', name: 'Камаз', plateNumber: 'A123BC77', vehicleKind: 'TRUCK' })
    assert.equal(matchesEquipmentQuery(vehicle, 'камаз'), true)
    assert.equal(matchesEquipmentQuery(vehicle, 'а123'), true)
    assert.equal(matchesEquipmentQuery(vehicle, 'грузовой'), true)
    assert.equal(matchesEquipmentQuery(vehicle, 'насос'), false)
  })

  it('puts flagged cards first', () => {
    const sorted = sortEquipment([
      item({ id: 'a', name: 'Анкер' }),
      item({ id: 'b', name: 'Болгарка', fillStatus: 'PENDING_REVIEW' }),
      item({ id: 'c', name: 'Вентилятор', fillStatus: 'NEEDS_FIX' }),
    ])
    assert.deepEqual(
      sorted.map((i) => i.id),
      ['c', 'b', 'a'],
    )
  })

  it('finds who sent an item to repair', () => {
    const inRepair = item({ ownerType: 'WAREHOUSE', ownerUserId: null, ownerWarehouseId: 'wh-repair' })
    const toRepair: Transfer = {
      ...pending,
      id: 'tr-2',
      status: 'COMPLETED',
      toWarehouseId: 'wh-repair',
      toLabel: 'Ремонт',
      createdAt: '2026-01-05T00:00:00.000Z',
    }
    assert.deepEqual(repairOrigin(inRepair, [pending, toRepair]), {
      by: 'Мастер',
      from: 'Мастер',
      at: '2026-01-05T00:00:00.000Z',
    })
    assert.equal(repairOrigin(inRepair, [pending]), null)
  })

  it('pluralizes positions', () => {
    assert.equal(positionsLabel(1), '1 позиция')
    assert.equal(positionsLabel(3), '3 позиции')
    assert.equal(positionsLabel(12), '12 позиций')
    assert.equal(positionsLabel(21), '21 позиция')
  })
})
