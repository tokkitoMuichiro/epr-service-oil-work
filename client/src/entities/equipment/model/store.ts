import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useRoleStore } from '@/entities/role'
import { cloneDemoState } from '../api/mock'
import {
  buildAuth,
  canAcceptTransfer,
  canCancelPendingTransfer,
  canChangeCondition,
  canCreate,
  canTransferItem,
  canViewItem,
  pendingTransfer,
} from './access'
import type {
  EquipmentCondition,
  EquipmentDraft,
  EquipmentItem,
  Transfer,
  TransferDraft,
  Warehouse,
} from './types'
import { ownerLabel } from './types'

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

function delay(ms = 180) {
  return new Promise((r) => setTimeout(r, ms))
}

export const useEquipmentStore = defineStore('equipment', () => {
  const people = ref(cloneDemoState().people)
  const warehouses = ref<Warehouse[]>([])
  const items = ref<EquipmentItem[]>([])
  const transfers = ref<Transfer[]>([])
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const errorMessage = ref('')
  const query = ref('')
  const typeFilter = ref<'' | 'SERIAL' | 'CONSUMABLE'>('')
  const conditionFilter = ref<'' | EquipmentCondition>('')
  const selectedId = ref<string | null>(null)

  const roleStore = useRoleStore()

  const auth = computed(() => buildAuth(roleStore.currentRole, people.value))

  const visibleItems = computed(() =>
    items.value.filter((item) => canViewItem(auth.value, item)),
  )

  const filteredItems = computed(() => {
    const q = query.value.trim().toLowerCase()
    return visibleItems.value.filter((item) => {
      if (typeFilter.value && item.type !== typeFilter.value) return false
      if (conditionFilter.value && item.condition !== conditionFilter.value) return false
      if (!q) return true
      const owner = ownerLabel(item, people.value, warehouses.value).toLowerCase()
      return (
        item.name.toLowerCase().includes(q) ||
        (item.factoryNumber || '').toLowerCase().includes(q) ||
        owner.includes(q)
      )
    })
  })

  const selectedItem = computed(
    () => items.value.find((i) => i.id === selectedId.value) ?? null,
  )

  const pendingIncoming = computed(() =>
    visibleItems.value.filter((item) =>
      canAcceptTransfer(auth.value, item, transfers.value),
    ),
  )

  const isEmpty = computed(
    () => status.value === 'ready' && filteredItems.value.length === 0,
  )

  const repairWarehouse = computed(
    () => warehouses.value.find((w) => w.slug === 'repair') ?? null,
  )

  async function load() {
    status.value = 'loading'
    errorMessage.value = ''
    try {
      await delay()
      const demo = cloneDemoState()
      people.value = demo.people
      warehouses.value = demo.warehouses
      items.value = demo.equipment
      transfers.value = demo.transfers
      status.value = 'ready'
      if (!selectedId.value && items.value[0]) selectedId.value = items.value[0].id
    } catch (e) {
      status.value = 'error'
      errorMessage.value = e instanceof Error ? e.message : 'Ошибка загрузки'
    }
  }

  function select(id: string) {
    selectedId.value = id
  }

  function personName(id?: string | null) {
    return people.value.find((p: { id: string; fullName: string }) => p.id === id)?.fullName ?? '—'
  }

  function warehouseName(id?: string | null) {
    return warehouses.value.find((w: { id: string; name: string }) => w.id === id)?.name ?? '—'
  }

  function labelForTarget(draft: TransferDraft) {
    if (draft.toOwnerType === 'USER') return personName(draft.toUserId)
    return warehouseName(draft.toWarehouseId)
  }

  function labelForOwner(item: EquipmentItem) {
    return ownerLabel(item, people.value, warehouses.value)
  }

  async function createItem(draft: EquipmentDraft) {
    if (!canCreate(auth.value)) throw new Error('Недостаточно прав')
    await delay(120)
    const item: EquipmentItem = {
      id: uid('eq'),
      name: draft.name.trim(),
      factoryNumber: draft.type === 'SERIAL' ? draft.factoryNumber?.trim() || null : null,
      quantity: draft.type === 'SERIAL' ? 1 : Math.max(1, draft.quantity),
      type: draft.type,
      condition: draft.condition,
      conditionNote: draft.conditionNote?.trim() || null,
      hasDocuments: false,
      category: 'EQUIPMENT',
      ownerType: draft.ownerType,
      ownerUserId: draft.ownerType === 'USER' ? draft.ownerUserId : null,
      ownerWarehouseId: draft.ownerType === 'WAREHOUSE' ? draft.ownerWarehouseId : null,
      fillStatus: 'OK',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    items.value = [item, ...items.value]
    selectedId.value = item.id
    return item
  }

  async function updateCondition(id: string, condition: EquipmentCondition, note?: string) {
    const item = items.value.find((i) => i.id === id)
    if (!item) return
    if (!canChangeCondition(auth.value, item, transfers.value)) {
      throw new Error('Недостаточно прав для смены состояния')
    }
    await delay(100)
    item.condition = condition
    item.conditionNote = note?.trim() || null
    item.updatedAt = new Date().toISOString()

    if (condition === 'IN_REPAIR' && repairWarehouse.value) {
      await moveToRepair(item)
    }
  }

  async function moveToRepair(item: EquipmentItem) {
    const repair = repairWarehouse.value
    if (!repair) return
    if (item.ownerWarehouseId === repair.id) return

    const transfer: Transfer = {
      id: uid('tr'),
      equipmentId: item.id,
      equipmentName: item.name,
      factoryNumber: item.factoryNumber,
      quantity: item.quantity,
      status: 'COMPLETED',
      fromOwnerType: item.ownerType,
      fromUserId: item.ownerUserId,
      fromWarehouseId: item.ownerWarehouseId,
      fromLabel: labelForOwner(item),
      toOwnerType: 'WAREHOUSE',
      toWarehouseId: repair.id,
      toLabel: repair.name,
      actorUserId: auth.value.user.id,
      createdAt: new Date().toISOString(),
    }
    transfers.value = [transfer, ...transfers.value]
    item.ownerType = 'WAREHOUSE'
    item.ownerUserId = null
    item.ownerWarehouseId = repair.id
    item.pendingTransferId = null
    item.updatedAt = new Date().toISOString()
  }

  async function createTransfer(draft: TransferDraft) {
    const item = items.value.find((i) => i.id === draft.equipmentId)
    if (!item) throw new Error('Позиция не найдена')
    if (!canTransferItem(auth.value, item, transfers.value)) {
      throw new Error('Передача недоступна')
    }

    const qty =
      item.type === 'SERIAL' ? 1 : Math.min(item.quantity, Math.max(1, draft.quantity))
    const toRepair =
      draft.toOwnerType === 'WAREHOUSE' &&
      warehouses.value.find((w) => w.id === draft.toWarehouseId)?.slug === 'repair'

    await delay(120)

    if (toRepair || item.condition === 'IN_REPAIR') {
      const transfer: Transfer = {
        id: uid('tr'),
        equipmentId: item.id,
        equipmentName: item.name,
        factoryNumber: item.factoryNumber,
        quantity: qty,
        status: 'COMPLETED',
        fromOwnerType: item.ownerType,
        fromUserId: item.ownerUserId,
        fromWarehouseId: item.ownerWarehouseId,
        fromLabel: labelForOwner(item),
        toOwnerType: draft.toOwnerType,
        toUserId: draft.toUserId,
        toWarehouseId: draft.toWarehouseId,
        toLabel: labelForTarget(draft),
        actorUserId: auth.value.user.id,
        createdAt: new Date().toISOString(),
      }
      transfers.value = [transfer, ...transfers.value]
      applyOwnership(item, draft, qty, true)
      if (toRepair) item.condition = 'IN_REPAIR'
      return transfer
    }

    const transfer: Transfer = {
      id: uid('tr'),
      equipmentId: item.id,
      equipmentName: item.name,
      factoryNumber: item.factoryNumber,
      quantity: qty,
      status: 'PENDING',
      fromOwnerType: item.ownerType,
      fromUserId: item.ownerUserId,
      fromWarehouseId: item.ownerWarehouseId,
      fromLabel: labelForOwner(item),
      toOwnerType: draft.toOwnerType,
      toUserId: draft.toUserId,
      toWarehouseId: draft.toWarehouseId,
      toLabel: labelForTarget(draft),
      actorUserId: auth.value.user.id,
      createdAt: new Date().toISOString(),
    }
    transfers.value = [transfer, ...transfers.value]
    item.pendingTransferId = transfer.id
    item.updatedAt = new Date().toISOString()
    return transfer
  }

  function applyOwnership(
    item: EquipmentItem,
    draft: TransferDraft,
    qty: number,
    completed: boolean,
  ) {
    if (!completed) return
    if (item.type === 'CONSUMABLE' && qty < item.quantity) {
      item.quantity -= qty
      const clone: EquipmentItem = {
        ...structuredClone(item),
        id: uid('eq'),
        quantity: qty,
        ownerType: draft.toOwnerType,
        ownerUserId: draft.toOwnerType === 'USER' ? draft.toUserId : null,
        ownerWarehouseId: draft.toOwnerType === 'WAREHOUSE' ? draft.toWarehouseId : null,
        pendingTransferId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      items.value = [clone, ...items.value]
      item.updatedAt = new Date().toISOString()
      return
    }
    item.ownerType = draft.toOwnerType
    item.ownerUserId = draft.toOwnerType === 'USER' ? draft.toUserId : null
    item.ownerWarehouseId = draft.toOwnerType === 'WAREHOUSE' ? draft.toWarehouseId : null
    item.pendingTransferId = null
    item.updatedAt = new Date().toISOString()
  }

  async function acceptTransfer(equipmentId: string) {
    const item = items.value.find((i) => i.id === equipmentId)
    if (!item) return
    if (!canAcceptTransfer(auth.value, item, transfers.value)) {
      throw new Error('Принять может только получатель')
    }
    const pending = pendingTransfer(item, transfers.value)
    if (!pending) return
    await delay(100)
    pending.status = 'COMPLETED'
    applyOwnership(
      item,
      {
        equipmentId: item.id,
        quantity: pending.quantity,
        toOwnerType: pending.toOwnerType,
        toUserId: pending.toUserId ?? undefined,
        toWarehouseId: pending.toWarehouseId ?? undefined,
      },
      pending.quantity,
      true,
    )
  }

  async function cancelTransfer(equipmentId: string) {
    const item = items.value.find((i) => i.id === equipmentId)
    if (!item) return
    if (!canCancelPendingTransfer(auth.value, item, transfers.value)) {
      throw new Error('Отмена недоступна')
    }
    const pending = pendingTransfer(item, transfers.value)
    if (!pending) return
    await delay(100)
    pending.status = 'CANCELLED'
    item.pendingTransferId = null
    item.updatedAt = new Date().toISOString()
  }

  function itemsOnWarehouse(warehouseId: string) {
    return visibleItems.value.filter(
      (i) => i.ownerType === 'WAREHOUSE' && i.ownerWarehouseId === warehouseId,
    )
  }

  return {
    people,
    warehouses,
    items,
    transfers,
    status,
    errorMessage,
    query,
    typeFilter,
    conditionFilter,
    selectedId,
    auth,
    visibleItems,
    filteredItems,
    selectedItem,
    pendingIncoming,
    isEmpty,
    repairWarehouse,
    load,
    select,
    createItem,
    updateCondition,
    createTransfer,
    acceptTransfer,
    cancelTransfer,
    itemsOnWarehouse,
    labelForOwner,
    personName,
    warehouseName,
  }
})
