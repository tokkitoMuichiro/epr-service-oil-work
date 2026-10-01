import { apiUrl, downloadFile, http } from '@/shared/api'
import type {
  BitrixExportResult,
  BulkTransferDraft,
  BulkTransferResult,
  EquipmentCondition,
  EquipmentDraft,
  EquipmentHistoryEntry,
  EquipmentItem,
  EquipmentPatch,
  EquipmentState,
  Transfer,
  TransferDraft,
  Warehouse,
  WarehouseDraft,
} from '../model/types'

interface One<T> {
  item: T
}

export const equipmentApi = {
  state(): Promise<EquipmentState> {
    return http.get<EquipmentState>('/equipment/state')
  },

  async create(draft: EquipmentDraft): Promise<EquipmentItem> {
    return (await http.post<One<EquipmentItem>>('/equipment', draft)).item
  },

  async update(id: string, patch: EquipmentPatch): Promise<EquipmentItem> {
    return (await http.patch<One<EquipmentItem>>(`/equipment/${id}`, patch)).item
  },

  remove(id: string): Promise<void> {
    return http.delete(`/equipment/${id}`)
  },

  async updateCondition(id: string, condition: EquipmentCondition, note?: string): Promise<EquipmentItem> {
    return (await http.patch<One<EquipmentItem>>(`/equipment/${id}/condition`, { condition, note })).item
  },

  async createTransfer(draft: TransferDraft): Promise<Transfer> {
    return (await http.post<One<Transfer>>('/equipment/transfers', draft)).item
  },

  async bulkTransfer(draft: BulkTransferDraft): Promise<BulkTransferResult> {
    return (await http.post<One<BulkTransferResult>>('/equipment/transfers/bulk', draft)).item
  },

  async accept(id: string): Promise<EquipmentItem> {
    return (await http.post<One<EquipmentItem>>(`/equipment/${id}/accept`)).item
  },

  async cancel(id: string): Promise<EquipmentItem> {
    return (await http.post<One<EquipmentItem>>(`/equipment/${id}/cancel`)).item
  },

  async flagFill(id: string, comment: string): Promise<EquipmentItem> {
    return (await http.post<One<EquipmentItem>>(`/equipment/${id}/fill/flag`, { comment })).item
  },

  async confirmFill(id: string): Promise<EquipmentItem> {
    return (await http.post<One<EquipmentItem>>(`/equipment/${id}/fill/confirm`)).item
  },

  async history(id: string): Promise<EquipmentHistoryEntry[]> {
    return (await http.get<{ items: EquipmentHistoryEntry[] }>(`/equipment/${id}/history`)).items
  },

  async addDocument(id: string, file: File): Promise<EquipmentItem> {
    const query = { fileName: file.name, mimeType: file.type || 'application/octet-stream' }
    return (await http.upload<One<EquipmentItem>>('POST', `/equipment/${id}/documents`, file, query)).item
  },

  async removeDocument(id: string, docId: string): Promise<EquipmentItem> {
    return (await http.delete<One<EquipmentItem>>(`/equipment/${id}/documents/${docId}`)).item
  },

  documentUrl(id: string, docId: string) {
    return apiUrl(`/equipment/${id}/documents/${docId}/file`)
  },

  downloadDocument(id: string, docId: string, fileName: string): Promise<void> {
    return downloadFile(`/equipment/${id}/documents/${docId}/file`, fileName)
  },

  async createWarehouse(draft: WarehouseDraft): Promise<Warehouse> {
    return (await http.post<One<Warehouse>>('/equipment/warehouses', draft)).item
  },

  async updateWarehouse(id: string, draft: WarehouseDraft): Promise<Warehouse> {
    return (await http.patch<One<Warehouse>>(`/equipment/warehouses/${id}`, draft)).item
  },

  removeWarehouse(id: string): Promise<void> {
    return http.delete(`/equipment/warehouses/${id}`)
  },

  exportExcel(): Promise<void> {
    return downloadFile('/equipment/export.xls', 'Учёт оборудования.xls')
  },

  async exportToBitrix(): Promise<BitrixExportResult> {
    return (await http.post<One<BitrixExportResult>>('/equipment/export/bitrix')).item
  },
}
