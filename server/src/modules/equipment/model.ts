import {
  REPAIR_WAREHOUSE_SLUG,
  assetDisplayName,
  type EquipmentDocument,
  type EquipmentHistoryEntry,
  type EquipmentItem,
  type Transfer,
  type Warehouse,
} from '../../shared.js'

export const EQUIPMENT_KEY = 'equipment'
/** Files uploaded before Bitrix Disk; read from SQLite while they last. */
export const EQUIPMENT_FILES_BUCKET = 'equipment'

/** Documents are stored inside {@link EquipmentItem}; the Disk id never leaves the server. */
export interface EquipmentDocumentRecord extends EquipmentDocument {
  diskFileId?: string
}

export function diskFileIdOf(doc: EquipmentDocument): string {
  return (doc as EquipmentDocumentRecord).diskFileId ?? ''
}

export function withoutDiskFileId(doc: EquipmentDocument): EquipmentDocument {
  const { diskFileId: _id, ...rest } = doc as EquipmentDocumentRecord
  return rest
}

/** `ERP/Оборудование/<номер> <название>`. */
export function equipmentFolderName(item: Pick<EquipmentItem, 'name' | 'category' | 'plateNumber' | 'factoryNumber'>): string {
  return [item.factoryNumber?.trim(), assetDisplayName(item)].filter(Boolean).join(' ')
}

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
