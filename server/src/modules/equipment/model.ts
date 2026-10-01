import {
  REPAIR_WAREHOUSE_SLUG,
  type EquipmentHistoryEntry,
  type EquipmentItem,
  type Transfer,
  type Warehouse,
} from '../../shared.js'

export const EQUIPMENT_KEY = 'equipment'
export const EQUIPMENT_FILES_BUCKET = 'equipment'

export interface EquipmentData {
  warehouses: Warehouse[]
  items: EquipmentItem[]
  transfers: Transfer[]
  history: EquipmentHistoryEntry[]
}

export function repairWarehouse(): Warehouse {
  return {
    id: 'wh-repair',
    name: 'Ремонт',
    slug: REPAIR_WAREHOUSE_SLUG,
    isSystem: true,
    address: 'Системная база ремонта',
    keeperIds: [],
  }
}

export function emptyEquipment(): EquipmentData {
  return { warehouses: [repairWarehouse()], items: [], transfers: [], history: [] }
}
