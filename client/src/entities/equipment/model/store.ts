import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { errorMessage as toMessage } from '@/shared/api'
import { equipmentApi } from '../api/equipment'
import {
  REPAIR_WAREHOUSE_SLUG,
  authFor,
  canConfirmFill,
  isIncomingFor,
  ownerLabel,
  ownsItem,
  type BitrixExportResult,
  type BulkTransferDraft,
  type BulkTransferResult,
  type DemoPerson,
  type EquipmentCondition,
  type EquipmentDraft,
  type EquipmentItem,
  type EquipmentPatch,
  type EquipmentPermission,
  type Transfer,
  type TransferDraft,
  type Warehouse,
  type WarehouseDraft,
} from './types'

const NOBODY: DemoPerson = { id: '', fullName: '—', roleSlug: 'office', warehouseIds: [] }

export const useEquipmentStore = defineStore('equipment', () => {
  const persona = ref<DemoPerson>(NOBODY)
  const permissions = ref<EquipmentPermission[]>([])
  const people = ref<DemoPerson[]>([])
  const warehouses = ref<Warehouse[]>([])
  const items = ref<EquipmentItem[]>([])
  const transfers = ref<Transfer[]>([])
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const errorMessage = ref('')
  const actionError = ref('')
  const busy = ref(false)
  const lastBitrixExport = ref<BitrixExportResult | null>(null)

  const auth = computed(() => authFor(persona.value, permissions.value))
  const isReady = computed(() => status.value === 'ready')

  const repairWarehouse = computed(() => warehouses.value.find((w) => w.slug === REPAIR_WAREHOUSE_SLUG) ?? null)

  const pendingIncoming = computed(() =>
    items.value.filter((item) => isIncomingFor(auth.value, item, transfers.value)),
  )

  const needsFixMine = computed(() =>
    items.value.filter((item) => item.fillStatus === 'NEEDS_FIX' && ownsItem(auth.value, item)),
  )

  const pendingReview = computed(() =>
    items.value.filter((item) => item.fillStatus === 'PENDING_REVIEW' && canConfirmFill(auth.value, item)),
  )

  const myItems = computed(() =>
    items.value.filter(
      (item) =>
        (item.ownerType === 'USER' && item.ownerUserId === persona.value.id) ||
        isIncomingFor(auth.value, item, transfers.value),
    ),
  )

  async function fetchState() {
    const state = await equipmentApi.state()
    persona.value = state.persona
    permissions.value = state.permissions
    people.value = state.people
    warehouses.value = state.warehouses
    items.value = state.items
    transfers.value = state.transfers
  }

  async function load() {
    status.value = 'loading'
    errorMessage.value = ''
    actionError.value = ''
    try {
      await fetchState()
      status.value = 'ready'
    } catch (e) {
      status.value = 'error'
      errorMessage.value = toMessage(e, 'Ошибка загрузки')
    }
  }

  async function mutate(action: () => Promise<unknown>, fallback: string): Promise<boolean> {
    busy.value = true
    actionError.value = ''
    try {
      await action()
      await fetchState()
      return true
    } catch (e) {
      actionError.value = toMessage(e, fallback)
      return false
    } finally {
      busy.value = false
    }
  }

  function clearActionError() {
    actionError.value = ''
  }

  function findItem(id: string | null | undefined) {
    return items.value.find((i) => i.id === id) ?? null
  }

  function personName(id?: string | null) {
    return people.value.find((p) => p.id === id)?.fullName ?? '—'
  }

  function warehouseName(id?: string | null) {
    return warehouses.value.find((w) => w.id === id)?.name ?? '—'
  }

  function labelForOwner(item: EquipmentItem) {
    return ownerLabel(item, people.value, warehouses.value)
  }

  function itemsOfUser(userId: string) {
    return items.value.filter((i) => i.ownerType === 'USER' && i.ownerUserId === userId)
  }

  function itemsOnWarehouse(warehouseId: string) {
    return items.value.filter((i) => i.ownerType === 'WAREHOUSE' && i.ownerWarehouseId === warehouseId)
  }

  function fetchHistory(id: string) {
    return equipmentApi.history(id)
  }

  function createItem(draft: EquipmentDraft, files: File[] = []) {
    return mutate(async () => {
      const item = await equipmentApi.create(draft)
      for (const file of files) await equipmentApi.addDocument(item.id, file)
    }, 'Не удалось создать позицию')
  }

  function updateItem(id: string, patch: EquipmentPatch) {
    return mutate(() => equipmentApi.update(id, patch), 'Не удалось сохранить карточку')
  }

  function removeItem(id: string) {
    return mutate(() => equipmentApi.remove(id), 'Не удалось удалить позицию')
  }

  function updateCondition(id: string, condition: EquipmentCondition, note?: string) {
    return mutate(() => equipmentApi.updateCondition(id, condition, note), 'Не удалось сменить состояние')
  }

  function createTransfer(draft: TransferDraft) {
    return mutate(() => equipmentApi.createTransfer(draft), 'Не удалось создать передачу')
  }

  async function bulkTransfer(draft: BulkTransferDraft): Promise<BulkTransferResult | null> {
    let result: BulkTransferResult | null = null
    const isDone = await mutate(async () => {
      result = await equipmentApi.bulkTransfer(draft)
    }, 'Не удалось передать позиции')
    return isDone ? result : null
  }

  function acceptTransfer(id: string) {
    return mutate(() => equipmentApi.accept(id), 'Не удалось принять передачу')
  }

  function cancelTransfer(id: string) {
    return mutate(() => equipmentApi.cancel(id), 'Не удалось отменить передачу')
  }

  function flagFill(id: string, comment: string) {
    return mutate(() => equipmentApi.flagFill(id, comment), 'Не удалось отправить замечание')
  }

  function confirmFill(id: string) {
    return mutate(() => equipmentApi.confirmFill(id), 'Не удалось подтвердить заполнение')
  }

  function addDocuments(id: string, files: File[]) {
    return mutate(async () => {
      for (const file of files) await equipmentApi.addDocument(id, file)
    }, 'Не удалось загрузить документ')
  }

  function removeDocument(id: string, docId: string) {
    return mutate(() => equipmentApi.removeDocument(id, docId), 'Не удалось удалить документ')
  }

  function downloadDocument(id: string, docId: string, fileName: string) {
    return mutate(() => equipmentApi.downloadDocument(id, docId, fileName), 'Не удалось скачать документ')
  }

  function saveWarehouse(draft: WarehouseDraft, id?: string) {
    return mutate(
      () => (id ? equipmentApi.updateWarehouse(id, draft) : equipmentApi.createWarehouse(draft)),
      'Не удалось сохранить базу',
    )
  }

  function removeWarehouse(id: string) {
    return mutate(() => equipmentApi.removeWarehouse(id), 'Не удалось удалить базу')
  }

  function exportExcel() {
    return mutate(() => equipmentApi.exportExcel(), 'Не удалось выгрузить Excel')
  }

  function exportToBitrix() {
    return mutate(async () => {
      lastBitrixExport.value = await equipmentApi.exportToBitrix()
    }, 'Не удалось выгрузить в Битрикс')
  }

  return {
    persona,
    permissions,
    people,
    warehouses,
    items,
    transfers,
    status,
    errorMessage,
    actionError,
    busy,
    lastBitrixExport,
    auth,
    isReady,
    repairWarehouse,
    pendingIncoming,
    needsFixMine,
    pendingReview,
    myItems,
    load,
    clearActionError,
    findItem,
    personName,
    warehouseName,
    labelForOwner,
    itemsOfUser,
    itemsOnWarehouse,
    fetchHistory,
    createItem,
    updateItem,
    removeItem,
    updateCondition,
    createTransfer,
    bulkTransfer,
    acceptTransfer,
    cancelTransfer,
    flagFill,
    confirmFill,
    addDocuments,
    removeDocument,
    downloadDocument,
    saveWarehouse,
    removeWarehouse,
    exportExcel,
    exportToBitrix,
  }
})
