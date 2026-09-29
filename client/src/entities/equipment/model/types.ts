export type EquipmentType = 'SERIAL' | 'CONSUMABLE'
export type EquipmentCondition = 'OK' | 'NEEDS_REPAIR' | 'IN_REPAIR' | 'IRREPARABLE'
export type OwnerType = 'USER' | 'WAREHOUSE'
export type TransferStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED'
export type FillStatus = 'OK' | 'NEEDS_FIX' | 'PENDING_REVIEW'
export type AssetCategory = 'EQUIPMENT' | 'VEHICLE' | 'CARD'

export type EquipmentPermission =
  | 'view_own'
  | 'view_all'
  | 'create'
  | 'edit'
  | 'edit_all'
  | 'edit_condition'
  | 'delete'
  | 'transfer'
  | 'manage_warehouses'
  | 'manage_roles'
  | 'export_excel'

export interface DemoPerson {
  id: string
  fullName: string
  roleSlug: 'admin' | 'master' | 'keeper' | 'office'
  warehouseIds: string[]
}

export interface Warehouse {
  id: string
  name: string
  slug: string
  isSystem: boolean
  address?: string
  keeperIds: string[]
}

export interface Transfer {
  id: string
  equipmentId: string | null
  equipmentName: string
  factoryNumber?: string | null
  quantity: number
  status: TransferStatus
  fromOwnerType: OwnerType
  fromUserId?: string | null
  fromWarehouseId?: string | null
  fromLabel: string
  toOwnerType: OwnerType
  toUserId?: string | null
  toWarehouseId?: string | null
  toLabel: string
  actorUserId: string
  createdAt: string
}

export interface EquipmentItem {
  id: string
  name: string
  factoryNumber?: string | null
  quantity: number
  type: EquipmentType
  condition: EquipmentCondition
  conditionNote?: string | null
  hasDocuments: boolean
  category: AssetCategory
  ownerType: OwnerType
  ownerUserId?: string | null
  ownerWarehouseId?: string | null
  pendingTransferId?: string | null
  fillStatus: FillStatus
  fillComment?: string | null
  createdAt: string
  updatedAt: string
}

export interface EquipmentDraft {
  name: string
  factoryNumber?: string
  quantity: number
  type: EquipmentType
  condition: EquipmentCondition
  conditionNote?: string
  ownerType: OwnerType
  ownerUserId?: string
  ownerWarehouseId?: string
}

export interface TransferDraft {
  equipmentId: string
  quantity: number
  toOwnerType: OwnerType
  toUserId?: string
  toWarehouseId?: string
}

export const CONDITION_LABEL: Record<EquipmentCondition, string> = {
  OK: 'Исправное',
  NEEDS_REPAIR: 'Требует ремонта',
  IN_REPAIR: 'В ремонте',
  IRREPARABLE: 'Не подлежит ремонту',
}

export const CONDITION_OPTIONS = (
  Object.entries(CONDITION_LABEL) as [EquipmentCondition, string][]
).map(([value, label]) => ({ value, label }))

export const TYPE_LABEL: Record<EquipmentType, string> = {
  SERIAL: 'Серийное',
  CONSUMABLE: 'Неномерное',
}

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  PENDING: 'Ждёт принятия',
  COMPLETED: 'Выполнена',
  CANCELLED: 'Отменена',
}

export const ROLE_PERMISSIONS: Record<string, EquipmentPermission[]> = {
  admin: [
    'view_own',
    'view_all',
    'create',
    'edit',
    'edit_all',
    'edit_condition',
    'delete',
    'transfer',
    'manage_warehouses',
    'manage_roles',
    'export_excel',
  ],
  master: ['view_own', 'create', 'edit', 'transfer', 'edit_condition'],
  storekeeper: [
    'view_own',
    'view_all',
    'create',
    'edit',
    'edit_condition',
    'transfer',
    'manage_warehouses',
  ],
  office: ['view_all'],
}

export function conditionTone(condition: EquipmentCondition) {
  if (condition === 'OK') return 'ok'
  if (condition === 'NEEDS_REPAIR') return 'warn'
  if (condition === 'IN_REPAIR') return 'repair'
  return 'bad'
}

export function ownerLabel(
  item: EquipmentItem,
  people: DemoPerson[],
  warehouses: Warehouse[],
) {
  if (item.ownerType === 'USER') {
    return people.find((p) => p.id === item.ownerUserId)?.fullName ?? 'Сотрудник'
  }
  const wh = warehouses.find((w) => w.id === item.ownerWarehouseId)
  return wh ? `База: ${wh.name}` : 'Производственная база'
}
