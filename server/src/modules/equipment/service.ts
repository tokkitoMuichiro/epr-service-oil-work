import { persisted, type Storage } from '../../db.js'
import {
  HttpError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  nowIso,
  trimmed,
  uid,
  type StoredFile,
} from '../../http.js'
import {
  CONDITION_LABEL,
  REPAIR_WAREHOUSE_SLUG,
  ROLE_PERMISSIONS,
  assetDisplayName,
  authFor,
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
  canManageWarehouses,
  canSeeFillComment,
  canTransferItem,
  canViewAllList,
  isFillBlocked,
  isPendingAccept,
  mergeEquipmentPatch,
  normalizeConditionNote,
  normalizeEquipmentFields,
  ownerLabel,
  ownsItem,
  pendingTransfer,
  sortEquipment,
  validateEquipmentDraft,
  validateEquipmentPatch,
  validateWarehouseDraft,
  withKeeperWarehouses,
  type BitrixExportResult,
  type BulkTransferDraft,
  type BulkTransferResult,
  type EquipmentAuth,
  type EquipmentCondition,
  type EquipmentDocument,
  type EquipmentDraft,
  type EquipmentHistoryAction,
  type EquipmentHistoryEntry,
  type EquipmentItem,
  type EquipmentPatch,
  type EquipmentPermission,
  type EquipmentPerson,
  type EquipmentState,
  type OwnerType,
  type RoleId,
  type Transfer,
  type TransferDraft,
  type User,
  type Warehouse,
  type WarehouseDraft,
} from '../../shared.js'
import { EQUIPMENT_FILES_BUCKET, EQUIPMENT_KEY, emptyEquipment, type EquipmentData } from './model.js'

interface Target {
  ownerType: OwnerType
  userId: string | null
  warehouseId: string | null
}

export interface DocumentUpload {
  fileName: string
}

function sameName(a: string, b: string) {
  return a.trim().toLocaleLowerCase('ru') === b.trim().toLocaleLowerCase('ru')
}

export type EquipmentActor = Pick<User, 'id' | 'fullName' | 'role'>

export interface EquipmentDeps {
  /** All system users, including blocked ones (their names stay in labels). */
  users: () => User[]
  permissionsOf?: (role: RoleId) => EquipmentPermission[]
}

function personOf(user: EquipmentActor): Omit<EquipmentPerson, 'warehouseIds'> {
  return { id: user.id, fullName: user.fullName, role: user.role }
}

export function createEquipmentService(storage: Storage, deps: EquipmentDeps) {
  const permissionsOf = deps.permissionsOf ?? ((role: RoleId) => [...ROLE_PERMISSIONS[role]])
  const snapshot = storage.snapshot<EquipmentData>(EQUIPMENT_KEY, { empty: emptyEquipment })
  const state = snapshot.state
  const files = storage.files(EQUIPMENT_FILES_BUCKET)

  /** Active users: possible owners, recipients and keepers. */
  function people(): EquipmentPerson[] {
    return withKeeperWarehouses(
      deps.users().filter((u) => u.active).map(personOf),
      state.warehouses,
    )
  }

  function auth(actor: EquipmentActor): EquipmentAuth {
    const [user] = withKeeperWarehouses([personOf(actor)], state.warehouses)
    return authFor(user, permissionsOf(actor.role))
  }

  function canSee(a: EquipmentAuth, item: EquipmentItem) {
    return canBrowse(a) || ownsItem(a, item) || canAcceptTransfer(a, item, state.transfers)
  }

  function findItem(id: string): EquipmentItem {
    return state.items.find((i) => i.id === id) ?? notFound('Позиция не найдена')
  }

  function visibleItem(a: EquipmentAuth, id: string): EquipmentItem {
    const item = findItem(id)
    if (!canSee(a, item)) notFound('Позиция не найдена')
    return item
  }

  function findWarehouse(id: string): Warehouse {
    return state.warehouses.find((w) => w.id === id) ?? notFound('База не найдена')
  }

  function repairWarehouse() {
    return state.warehouses.find((w) => w.slug === REPAIR_WAREHOUSE_SLUG) ?? null
  }

  function isRepairTarget(target: Target) {
    return target.ownerType === 'WAREHOUSE' && target.warehouseId === repairWarehouse()?.id
  }

  function sanitized(a: EquipmentAuth, item: EquipmentItem): EquipmentItem {
    const copy = structuredClone(item)
    if (copy.fillComment && !canSeeFillComment(a, item)) copy.fillComment = null
    return copy
  }

  function labelOf(item: EquipmentItem) {
    return ownerLabel(item, deps.users(), state.warehouses)
  }

  function targetLabel(target: Target) {
    if (target.ownerType === 'USER') {
      const user = deps.users().find((u) => u.id === target.userId && u.active)
      return user?.fullName ?? notFound('Сотрудник не найден')
    }
    return state.warehouses.find((w) => w.id === target.warehouseId)?.name ?? notFound('База не найдена')
  }

  function parseTarget(draft: Partial<Pick<TransferDraft, 'toOwnerType' | 'toUserId' | 'toWarehouseId'>>): Target {
    if (draft.toOwnerType !== 'USER' && draft.toOwnerType !== 'WAREHOUSE') badRequest('Укажите получателя')
    const target: Target = {
      ownerType: draft.toOwnerType,
      userId: draft.toOwnerType === 'USER' ? trimmed(draft.toUserId) : null,
      warehouseId: draft.toOwnerType === 'WAREHOUSE' ? trimmed(draft.toWarehouseId) : null,
    }
    targetLabel(target)
    return target
  }

  function log(item: EquipmentItem, action: EquipmentHistoryAction, a: EquipmentAuth, details: string) {
    const entry: EquipmentHistoryEntry = {
      id: uid('h'),
      equipmentId: item.id,
      action,
      actorUserId: a.user.id,
      actorName: a.user.fullName,
      details,
      createdAt: nowIso(),
    }
    state.history.unshift(entry)
  }

  function touch(item: EquipmentItem) {
    item.updatedAt = nowIso()
  }

  function assertUniquePlate(plate: string | null, exceptId?: string) {
    if (!plate) return
    if (state.items.some((i) => i.id !== exceptId && i.plateNumber === plate)) {
      conflict('Такой госномер уже есть в учёте')
    }
  }

  function findLot(item: EquipmentItem): EquipmentItem | undefined {
    if (item.type !== 'CONSUMABLE') return undefined
    return state.items.find(
      (i) =>
        i.id !== item.id &&
        i.type === 'CONSUMABLE' &&
        i.category === item.category &&
        !i.pendingTransferId &&
        !isFillBlocked(i) &&
        i.condition === item.condition &&
        i.ownerType === item.ownerType &&
        (i.ownerUserId ?? null) === (item.ownerUserId ?? null) &&
        (i.ownerWarehouseId ?? null) === (item.ownerWarehouseId ?? null) &&
        sameName(i.name, item.name),
    )
  }

  /** Consumables with the same name, condition and owner live as one lot. */
  function mergeIntoLot(item: EquipmentItem): EquipmentItem {
    const lot = findLot(item)
    if (!lot || isFillBlocked(item)) return item
    lot.quantity += item.quantity
    touch(lot)
    state.items = state.items.filter((i) => i.id !== item.id)
    return lot
  }

  function applyOwnership(item: EquipmentItem, target: Target, qty: number): EquipmentItem {
    let moved = item
    if (item.type === 'CONSUMABLE' && qty < item.quantity) {
      item.quantity -= qty
      touch(item)
      moved = {
        ...structuredClone(item),
        id: uid('eq'),
        quantity: qty,
        documents: [],
        hasDocuments: false,
        createdAt: nowIso(),
      }
      state.items.unshift(moved)
    }
    moved.ownerType = target.ownerType
    moved.ownerUserId = target.userId
    moved.ownerWarehouseId = target.warehouseId
    moved.pendingTransferId = null
    touch(moved)
    return moved
  }

  function recordTransfer(
    item: EquipmentItem,
    target: Target,
    qty: number,
    status: Transfer['status'],
    a: EquipmentAuth,
  ): Transfer {
    const transfer: Transfer = {
      id: uid('tr'),
      equipmentId: item.id,
      equipmentName: assetDisplayName(item),
      factoryNumber: item.factoryNumber,
      quantity: qty,
      status,
      fromOwnerType: item.ownerType,
      fromUserId: item.ownerUserId,
      fromWarehouseId: item.ownerWarehouseId,
      fromLabel: labelOf(item),
      toOwnerType: target.ownerType,
      toUserId: target.userId,
      toWarehouseId: target.warehouseId,
      toLabel: targetLabel(target),
      actorUserId: a.user.id,
      actorName: a.user.fullName,
      createdAt: nowIso(),
    }
    state.transfers.unshift(transfer)
    return transfer
  }

  function moveToRepair(item: EquipmentItem, a: EquipmentAuth): EquipmentItem {
    const repair = repairWarehouse()
    if (!repair || item.ownerWarehouseId === repair.id) return item
    const target: Target = { ownerType: 'WAREHOUSE', userId: null, warehouseId: repair.id }
    const transfer = recordTransfer(item, target, item.quantity, 'COMPLETED', a)
    const moved = applyOwnership(item, target, item.quantity)
    log(moved, 'MOVED_TO_REPAIR', a, `${transfer.fromLabel} → ${repair.name}`)
    return mergeIntoLot(moved)
  }

  function transferOne(a: EquipmentAuth, item: EquipmentItem, target: Target, requested: number): Transfer {
    if (!canTransferItem(a, item, state.transfers)) {
      if (isFillBlocked(item)) forbidden('Сначала исправьте карточку по замечанию')
      forbidden('Передача недоступна')
    }
    const sameOwner =
      (target.ownerType === 'USER' && item.ownerType === 'USER' && item.ownerUserId === target.userId) ||
      (target.ownerType === 'WAREHOUSE' && item.ownerType === 'WAREHOUSE' && item.ownerWarehouseId === target.warehouseId)
    if (sameOwner) badRequest('Позиция уже у этого владельца')
    if (item.type === 'CONSUMABLE' && (requested < 1 || requested > item.quantity)) {
      badRequest(`Доступно только ${item.quantity} шт.`)
    }
    const qty = item.type === 'SERIAL' ? 1 : requested

    if (isRepairTarget(target)) {
      if (item.category === 'CARD') badRequest('Карты не отправляют в ремонт')
      const transfer = recordTransfer(item, target, qty, 'COMPLETED', a)
      const moved = applyOwnership(item, target, qty)
      moved.condition = 'IN_REPAIR'
      log(moved, 'TRANSFER_COMPLETED', a, `${transfer.fromLabel} → ${transfer.toLabel}, ${qty} шт.`)
      mergeIntoLot(moved)
      return transfer
    }

    const transfer = recordTransfer(item, target, qty, 'PENDING', a)
    item.pendingTransferId = transfer.id
    touch(item)
    log(item, 'TRANSFER_CREATED', a, `${transfer.fromLabel} → ${transfer.toLabel}, ${qty} шт.`)
    return transfer
  }

  function visibleTransfers(a: EquipmentAuth, items: EquipmentItem[]) {
    if (canViewAllList(a)) return state.transfers
    const mine = new Set(a.user.warehouseIds)
    const pendingIds = new Set(items.map((i) => i.pendingTransferId).filter(Boolean))
    const repairId = repairWarehouse()?.id
    return state.transfers.filter(
      (t) =>
        pendingIds.has(t.id) ||
        t.actorUserId === a.user.id ||
        t.fromUserId === a.user.id ||
        t.toUserId === a.user.id ||
        (t.fromWarehouseId && mine.has(t.fromWarehouseId)) ||
        (t.toWarehouseId && (mine.has(t.toWarehouseId) || t.toWarehouseId === repairId)),
    )
  }

  const service = {
    /** Items registered to the worker's user accounts: linked by `workerId`, otherwise by full name. */
    itemsOwnedBy(worker: { id: string; fullName: string }): string[] {
      const ids = new Set(
        deps
          .users()
          .filter((u) => (u.workerId ? u.workerId === worker.id : sameName(u.fullName, worker.fullName)))
          .map((u) => u.id),
      )
      return state.items
        .filter((i) => i.ownerType === 'USER' && i.ownerUserId && ids.has(i.ownerUserId))
        .map((i) => `${assetDisplayName(i)}${i.quantity > 1 ? `, ${i.quantity} шт.` : ''}`)
    },

    state(actor: EquipmentActor): EquipmentState {
      const a = auth(actor)
      const items = state.items.filter((i) => canSee(a, i))
      return {
        persona: structuredClone(a.user),
        permissions: [...a.permissions],
        people: people(),
        warehouses: structuredClone(state.warehouses),
        items: items.map((i) => sanitized(a, i)),
        transfers: structuredClone(visibleTransfers(a, items)),
      }
    },

    create(actor: EquipmentActor, body: Partial<EquipmentDraft>): EquipmentItem {
      const a = auth(actor)
      if (!canCreate(a)) forbidden()
      const error = validateEquipmentDraft(body)
      if (error) badRequest(error)
      const category = body.category ?? 'EQUIPMENT'
      const condition: EquipmentCondition = category === 'CARD' ? 'OK' : (body.condition as EquipmentCondition)
      const note = normalizeConditionNote(condition, body.conditionNote)
      if ('error' in note) badRequest(note.error)

      const toRepair = condition === 'IN_REPAIR'
      const owner: Target = toRepair
        ? { ownerType: 'USER', userId: a.user.id, warehouseId: null }
        : {
            ownerType: body.ownerType as OwnerType,
            userId: body.ownerType === 'USER' ? trimmed(body.ownerUserId) : null,
            warehouseId: body.ownerType === 'WAREHOUSE' ? trimmed(body.ownerWarehouseId) : null,
          }
      targetLabel(owner)
      if (!toRepair && isRepairTarget(owner)) badRequest('Чтобы отправить в ремонт, выберите состояние «В ремонте»')
      const scope = { condition, ownerType: owner.ownerType, ownerUserId: owner.userId ?? '', ownerWarehouseId: owner.warehouseId ?? '' }
      if (!canCreateFor(a, scope)) forbidden('Можно записать позицию только на себя или на свою базу')

      const fields = normalizeEquipmentFields(body)
      assertUniquePlate(fields.plateNumber)
      const now = nowIso()
      const item: EquipmentItem = {
        id: uid(category === 'VEHICLE' ? 'veh' : category === 'CARD' ? 'card' : 'eq'),
        ...fields,
        condition,
        conditionNote: note.note,
        hasDocuments: false,
        documents: [],
        ownerType: owner.ownerType,
        ownerUserId: owner.userId,
        ownerWarehouseId: owner.warehouseId,
        pendingTransferId: null,
        fillStatus: 'OK',
        fillComment: null,
        createdAt: now,
        updatedAt: now,
      }

      if (!toRepair) {
        const lot = findLot(item)
        if (lot) {
          lot.quantity += item.quantity
          touch(lot)
          log(lot, 'UPDATED', a, `Пополнение партии: +${item.quantity} шт.`)
          return sanitized(a, lot)
        }
      }

      state.items.unshift(item)
      log(item, 'CREATED', a, `${assetDisplayName(item)}, владелец: ${labelOf(item)}`)
      return sanitized(a, toRepair ? moveToRepair(item, a) : item)
    },

    update(actor: EquipmentActor, id: string, patch: EquipmentPatch): EquipmentItem {
      const a = auth(actor)
      const item = visibleItem(a, id)
      if (!canEditItem(a, item)) forbidden('Недостаточно прав для редактирования')
      if (isPendingAccept(item, state.transfers)) conflict('Позиция ожидает принятия — редактирование недоступно')
      const error = validateEquipmentPatch(item, patch)
      if (error) badRequest(error)
      const fields = normalizeEquipmentFields(mergeEquipmentPatch(item, patch))
      assertUniquePlate(fields.plateNumber, item.id)

      const changed: string[] = []
      if (fields.name !== item.name) changed.push(`название: ${fields.name}`)
      if ((fields.factoryNumber ?? '') !== (item.factoryNumber ?? '')) changed.push(`номер: ${fields.factoryNumber || '—'}`)
      if (fields.quantity !== item.quantity) changed.push(`количество: ${fields.quantity}`)
      if (fields.type !== item.type) changed.push('тип учёта')
      if (fields.vehicleKind !== (item.vehicleKind ?? null) || fields.cardKind !== (item.cardKind ?? null)) changed.push('вид')

      Object.assign(item, fields)
      if (item.fillStatus === 'NEEDS_FIX' && !canConfirmFill(a, item)) item.fillStatus = 'PENDING_REVIEW'
      touch(item)
      log(item, 'UPDATED', a, changed.length ? changed.join(', ') : 'Без изменений полей')
      return sanitized(a, item)
    },

    remove(actor: EquipmentActor, id: string) {
      const a = auth(actor)
      const item = visibleItem(a, id)
      if (!canDeleteItem(a, item, state.transfers)) {
        if (isPendingAccept(item, state.transfers)) conflict('Позиция ожидает принятия — удаление недоступно')
        forbidden('Недостаточно прав для удаления')
      }
      for (const doc of item.documents) files.delete(doc.id)
      state.items = state.items.filter((i) => i.id !== item.id)
    },

    updateCondition(actor: EquipmentActor, id: string, condition: EquipmentCondition, rawNote?: unknown): EquipmentItem {
      const a = auth(actor)
      const item = visibleItem(a, id)
      if (!(condition in CONDITION_LABEL)) badRequest('Неизвестное состояние')
      if (!canChangeCondition(a, item, state.transfers)) forbidden('Недостаточно прав для смены состояния')
      const note = normalizeConditionNote(condition, rawNote)
      if ('error' in note) badRequest(note.error)
      const previous = item.condition
      item.condition = condition
      item.conditionNote = note.note
      touch(item)
      const suffix = note.note ? `. ${note.note}` : ''
      log(item, 'CONDITION_CHANGED', a, `${CONDITION_LABEL[previous]} → ${CONDITION_LABEL[condition]}${suffix}`)
      const result = condition === 'IN_REPAIR' ? moveToRepair(item, a) : mergeIntoLot(item)
      return sanitized(a, result)
    },

    createTransfer(actor: EquipmentActor, draft: Partial<TransferDraft>): Transfer {
      const a = auth(actor)
      const item = visibleItem(a, trimmed(draft.equipmentId))
      const target = parseTarget(draft)
      return structuredClone(transferOne(a, item, target, Math.floor(Number(draft.quantity) || 1)))
    },

    bulkTransfer(actor: EquipmentActor, draft: Partial<BulkTransferDraft>): BulkTransferResult {
      const a = auth(actor)
      const ids = Array.isArray(draft.ids) ? [...new Set(draft.ids.map((id) => trimmed(id)).filter(Boolean))] : []
      if (!ids.length) badRequest('Выберите позиции для передачи')
      const target = parseTarget(draft)
      const result: BulkTransferResult = { transferred: 0, failed: [] }
      for (const id of ids) {
        try {
          const item = visibleItem(a, id)
          transferOne(a, item, target, item.quantity)
          result.transferred += 1
        } catch (err) {
          if (!(err instanceof HttpError)) throw err
          result.failed.push({ id, message: err.message })
        }
      }
      return result
    },

    accept(actor: EquipmentActor, id: string): EquipmentItem {
      const a = auth(actor)
      const item = visibleItem(a, id)
      if (!canAcceptTransfer(a, item, state.transfers)) forbidden('Принять может только получатель')
      const pending = pendingTransfer(item, state.transfers)
      if (!pending) badRequest('Нет ожидающей передачи')
      pending.status = 'COMPLETED'
      const target: Target = {
        ownerType: pending.toOwnerType,
        userId: pending.toUserId ?? null,
        warehouseId: pending.toWarehouseId ?? null,
      }
      item.pendingTransferId = null
      const moved = applyOwnership(item, target, Math.min(pending.quantity, item.quantity))
      log(moved, 'TRANSFER_ACCEPTED', a, `${pending.fromLabel} → ${pending.toLabel}, ${pending.quantity} шт.`)
      return sanitized(a, mergeIntoLot(moved))
    },

    cancel(actor: EquipmentActor, id: string): EquipmentItem {
      const a = auth(actor)
      const item = visibleItem(a, id)
      if (!canCancelPendingTransfer(a, item, state.transfers)) forbidden('Отмена недоступна')
      const pending = pendingTransfer(item, state.transfers)
      if (!pending) badRequest('Нет ожидающей передачи')
      pending.status = 'CANCELLED'
      item.pendingTransferId = null
      touch(item)
      log(item, 'TRANSFER_CANCELLED', a, `${pending.fromLabel} → ${pending.toLabel}`)
      return sanitized(a, item)
    },

    flagFill(actor: EquipmentActor, id: string, rawComment: unknown): EquipmentItem {
      const a = auth(actor)
      const item = visibleItem(a, id)
      if (!canFlagFill(a, item, state.transfers)) forbidden('Замечание может оставить только администратор')
      const comment = trimmed(rawComment)
      if (comment.length < 3) badRequest('Опишите, что нужно исправить')
      item.fillStatus = 'NEEDS_FIX'
      item.fillComment = comment
      touch(item)
      log(item, 'FILL_FLAGGED', a, comment)
      return sanitized(a, item)
    },

    confirmFill(actor: EquipmentActor, id: string): EquipmentItem {
      const a = auth(actor)
      const item = visibleItem(a, id)
      if (!canConfirmFill(a, item)) forbidden('Подтвердить заполнение может только администратор')
      item.fillStatus = 'OK'
      item.fillComment = null
      touch(item)
      log(item, 'FILL_CONFIRMED', a, 'Карточка проверена')
      return sanitized(a, item)
    },

    history(actor: EquipmentActor, id: string): EquipmentHistoryEntry[] {
      const item = visibleItem(auth(actor), id)
      return structuredClone(state.history.filter((h) => h.equipmentId === item.id))
    },

    addDocument(actor: EquipmentActor, id: string, meta: DocumentUpload, file: StoredFile): EquipmentItem {
      const a = auth(actor)
      const item = visibleItem(a, id)
      if (!canEditDocuments(a, item)) forbidden('Недостаточно прав для документов')
      const fileName = trimmed(meta.fileName).replace(/[\\/:*?"<>|]+/g, '_')
      if (!fileName) badRequest('Укажите имя файла')
      if (!file.data.length) badRequest('Файл пустой')
      const doc: EquipmentDocument = {
        id: uid('doc'),
        fileName,
        mimeType: file.mimeType,
        size: file.data.length,
        storagePath: `mock-disk/Оборудование/${assetDisplayName(item)}/${fileName}`,
        addedAt: nowIso(),
        addedBy: a.user.fullName,
      }
      files.set(doc.id, file)
      item.documents.unshift(doc)
      item.hasDocuments = true
      touch(item)
      log(item, 'DOCUMENT_ADDED', a, fileName)
      return sanitized(a, item)
    },

    documentFile(actor: EquipmentActor, id: string, docId: string): { doc: EquipmentDocument; file: StoredFile } {
      const item = visibleItem(auth(actor), id)
      const doc = item.documents.find((d) => d.id === docId) ?? notFound('Документ не найден')
      return { doc: structuredClone(doc), file: files.get(doc.id) ?? notFound('Файл документа не найден') }
    },

    removeDocument(actor: EquipmentActor, id: string, docId: string): EquipmentItem {
      const a = auth(actor)
      const item = visibleItem(a, id)
      if (!canEditDocuments(a, item)) forbidden('Недостаточно прав для документов')
      const doc = item.documents.find((d) => d.id === docId) ?? notFound('Документ не найден')
      item.documents = item.documents.filter((d) => d.id !== docId)
      item.hasDocuments = item.documents.length > 0
      files.delete(docId)
      touch(item)
      log(item, 'DOCUMENT_REMOVED', a, doc.fileName)
      return sanitized(a, item)
    },

    createWarehouse(actor: EquipmentActor, body: Partial<WarehouseDraft>): Warehouse {
      const a = auth(actor)
      if (!canManageWarehouses(a)) forbidden('Недостаточно прав для управления базами')
      const draft = parseWarehouse(body)
      const warehouse: Warehouse = {
        id: uid('wh'),
        slug: uid('base'),
        isSystem: false,
        ...draft,
      }
      state.warehouses.push(warehouse)
      return structuredClone(warehouse)
    },

    updateWarehouse(actor: EquipmentActor, id: string, body: Partial<WarehouseDraft>): Warehouse {
      const a = auth(actor)
      if (!canManageWarehouses(a)) forbidden('Недостаточно прав для управления базами')
      const warehouse = findWarehouse(id)
      const draft = parseWarehouse(body, warehouse.id)
      if (warehouse.isSystem && draft.name !== warehouse.name) badRequest('Системную базу нельзя переименовать')
      Object.assign(warehouse, draft)
      return structuredClone(warehouse)
    },

    removeWarehouse(actor: EquipmentActor, id: string) {
      const a = auth(actor)
      if (!canManageWarehouses(a)) forbidden('Недостаточно прав для управления базами')
      const warehouse = findWarehouse(id)
      if (warehouse.isSystem) badRequest('Системную базу нельзя удалить')
      if (state.items.some((i) => i.ownerType === 'WAREHOUSE' && i.ownerWarehouseId === id)) {
        conflict('На базе есть оборудование — сначала передайте его')
      }
      if (state.transfers.some((t) => t.status === 'PENDING' && t.toWarehouseId === id)) {
        conflict('На базу есть непринятые передачи')
      }
      state.warehouses = state.warehouses.filter((w) => w.id !== id)
    },

    exportRows(actor: EquipmentActor) {
      const a = auth(actor)
      if (!canExport(a)) forbidden('Экспорт доступен только роли с правом «Экспорт в Excel»')
      const directory = deps.users()
      return sortEquipment(state.items).map((item) => ({ item, owner: ownerLabel(item, directory, state.warehouses) }))
    },

    exportToBitrix(actor: EquipmentActor, date: string): BitrixExportResult {
      const rows = service.exportRows(actor)
      return {
        storagePath: `mock-disk/Оборудование/Учёт оборудования ${date}.xls`,
        rows: rows.length,
        exportedAt: nowIso(),
      }
    },
  }

  return persisted(
    service,
    [
      'create',
      'update',
      'remove',
      'updateCondition',
      'createTransfer',
      'bulkTransfer',
      'accept',
      'cancel',
      'flagFill',
      'confirmFill',
      'addDocument',
      'removeDocument',
      'createWarehouse',
      'updateWarehouse',
      'removeWarehouse',
    ],
    () => snapshot.save(state),
  )

  function parseWarehouse(body: Partial<WarehouseDraft>, exceptId?: string): WarehouseDraft {
    const error = validateWarehouseDraft(body)
    if (error) badRequest(error)
    const name = trimmed(body.name)
    if (state.warehouses.some((w) => w.id !== exceptId && sameName(w.name, name))) {
      conflict('База с таким названием уже есть')
    }
    const known = new Set(people().map((p) => p.id))
    const keeperIds = [...new Set((body.keeperIds ?? []).map((id) => trimmed(id)))].filter((id) => known.has(id))
    return { name, address: trimmed(body.address), keeperIds }
  }
}

export type EquipmentService = ReturnType<typeof createEquipmentService>
