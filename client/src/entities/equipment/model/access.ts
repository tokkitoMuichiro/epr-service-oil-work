import type { RoleId } from '@/entities/role'
import type {
  DemoPerson,
  EquipmentItem,
  EquipmentPermission,
  Transfer,
  Warehouse,
} from './types'
import { ROLE_PERMISSIONS } from './types'

export interface EquipmentAuth {
  user: DemoPerson
  permissions: EquipmentPermission[]
  can: (permission: EquipmentPermission) => boolean
}

/** Maps ERP role switcher → demo persona from equipment module. */
export function personaForRole(role: RoleId, people: DemoPerson[]): DemoPerson {
  const bySlug =
    role === 'storekeeper'
      ? 'keeper'
      : role === 'admin'
        ? 'admin'
        : role === 'master'
          ? 'master'
          : 'office'
  return (
    people.find((p) => p.roleSlug === bySlug) ??
    people.find((p) => p.roleSlug === 'admin')!
  )
}

export function buildAuth(role: RoleId, people: DemoPerson[]): EquipmentAuth {
  const user = personaForRole(role, people)
  const permissions = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.office
  return {
    user,
    permissions,
    can: (permission) => permissions.includes(permission),
  }
}

function isPrivileged(auth: EquipmentAuth) {
  return auth.can('edit_all') || auth.can('manage_roles')
}

function ownsItem(auth: EquipmentAuth, item: EquipmentItem) {
  if (item.ownerType === 'USER' && item.ownerUserId === auth.user.id) return true
  return (
    item.ownerType === 'WAREHOUSE' &&
    Boolean(item.ownerWarehouseId) &&
    auth.user.warehouseIds.includes(item.ownerWarehouseId!)
  )
}

function canActOnItem(auth: EquipmentAuth, item: EquipmentItem) {
  return isPrivileged(auth) || ownsItem(auth, item)
}

export function isPendingAccept(item: EquipmentItem, transfers: Transfer[]) {
  if (!item.pendingTransferId) return false
  const pending = transfers.find((t) => t.id === item.pendingTransferId)
  return pending?.status === 'PENDING'
}

export function pendingTransfer(item: EquipmentItem, transfers: Transfer[]) {
  if (!item.pendingTransferId) return null
  return transfers.find((t) => t.id === item.pendingTransferId) ?? null
}

export function isFillBlocked(item: EquipmentItem) {
  return item.fillStatus === 'NEEDS_FIX' || item.fillStatus === 'PENDING_REVIEW'
}

export function canTransferItem(
  auth: EquipmentAuth,
  item: EquipmentItem,
  transfers: Transfer[],
) {
  if (!auth.can('transfer')) return false
  if (isPendingAccept(item, transfers)) return false
  if (isFillBlocked(item)) return false
  return canActOnItem(auth, item)
}

export function canEditItem(
  auth: EquipmentAuth,
  item: EquipmentItem,
) {
  if (isPrivileged(auth)) return true
  if (auth.can('edit') && ownsItem(auth, item)) return true
  return false
}

export function canAcceptTransfer(
  auth: EquipmentAuth,
  item: EquipmentItem,
  transfers: Transfer[],
) {
  const pending = pendingTransfer(item, transfers)
  if (!pending || pending.status !== 'PENDING') return false
  if (isPrivileged(auth)) return true
  if (pending.toOwnerType === 'USER') return pending.toUserId === auth.user.id
  if (pending.toOwnerType === 'WAREHOUSE' && pending.toWarehouseId) {
    return auth.user.warehouseIds.includes(pending.toWarehouseId)
  }
  return false
}

export function canCancelPendingTransfer(
  auth: EquipmentAuth,
  item: EquipmentItem,
  transfers: Transfer[],
) {
  const pending = pendingTransfer(item, transfers)
  if (!pending || pending.status !== 'PENDING') return false
  if (isPrivileged(auth)) return true
  if (pending.actorUserId === auth.user.id) return true
  return ownsItem(auth, item)
}

export function canChangeCondition(
  auth: EquipmentAuth,
  item: EquipmentItem,
  transfers: Transfer[],
) {
  if (isPendingAccept(item, transfers)) return false
  if (isPrivileged(auth)) return true
  if (!auth.can('edit_condition')) return false
  return ownsItem(auth, item)
}

export function canCreate(auth: EquipmentAuth) {
  return auth.can('create')
}

export function canViewItem(auth: EquipmentAuth, item: EquipmentItem) {
  if (auth.can('view_all') || isPrivileged(auth)) return true
  return ownsItem(auth, item)
}

export function canManageWarehouse(auth: EquipmentAuth, warehouse: Warehouse) {
  if (isPrivileged(auth) || auth.can('manage_warehouses')) return true
  return auth.user.warehouseIds.includes(warehouse.id)
}
