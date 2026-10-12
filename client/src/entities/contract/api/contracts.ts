import { downloadFile, http } from '@/shared/api'
import type {
  Contract,
  ContractDraft,
  ObjectDraft,
  ObjectPatch,
  ObjectStatusChange,
  ReportDay,
  WorkDraft,
} from '../model/types'

type One = { item: Contract }

export interface ScheduleExportParams {
  contractId?: string
  objectId?: string
  isArchive?: boolean
}

export const contractsApi = {
  async list(): Promise<Contract[]> {
    return (await http.get<{ items: Contract[] }>('/contracts')).items
  },

  async reportDays(): Promise<ReportDay[]> {
    return (await http.get<{ items: ReportDay[] }>('/contracts/report-days')).items
  },

  exportSchedule(params: ScheduleExportParams, fallbackName: string): Promise<void> {
    const query = new URLSearchParams()
    if (params.objectId) query.set('objectId', params.objectId)
    else if (params.contractId) query.set('contractId', params.contractId)
    if (params.isArchive) query.set('archive', '1')
    const search = query.toString()
    return downloadFile(`/contracts/export.xlsx${search ? `?${search}` : ''}`, fallbackName)
  },

  async create(draft: ContractDraft): Promise<Contract> {
    return (await http.post<One>('/contracts', draft)).item
  },

  async update(id: string, draft: ContractDraft): Promise<Contract> {
    return (await http.patch<One>(`/contracts/${id}`, draft)).item
  },

  async remove(id: string): Promise<void> {
    await http.delete(`/contracts/${id}`)
  },

  async setArchived(id: string, archived: boolean): Promise<Contract> {
    return (await http.patch<One>(`/contracts/${id}/archive`, { archived })).item
  },

  async setObjectArchived(contractId: string, objectId: string, archived: boolean): Promise<Contract> {
    return (await http.patch<One>(`/contracts/${contractId}/objects/${objectId}/archive`, { archived })).item
  },

  async addObject(contractId: string, draft: ObjectDraft): Promise<Contract> {
    return (await http.post<One>(`/contracts/${contractId}/objects`, draft)).item
  },

  async updateObject(contractId: string, objectId: string, patch: ObjectPatch, note: string): Promise<Contract> {
    return (await http.patch<One>(`/contracts/${contractId}/objects/${objectId}`, { ...patch, note })).item
  },

  async setObjectStatus(contractId: string, objectId: string, change: ObjectStatusChange): Promise<Contract> {
    return (await http.patch<One>(`/contracts/${contractId}/objects/${objectId}/status`, change)).item
  },

  async removeObject(contractId: string, objectId: string): Promise<Contract> {
    return (await http.delete<One>(`/contracts/${contractId}/objects/${objectId}`)).item
  },

  async addWork(contractId: string, objectId: string, draft: WorkDraft): Promise<Contract> {
    return (await http.post<One>(`/contracts/${contractId}/objects/${objectId}/works`, draft)).item
  },

  async updateWork(contractId: string, objectId: string, workId: string, draft: WorkDraft): Promise<Contract> {
    return (await http.patch<One>(`/contracts/${contractId}/objects/${objectId}/works/${workId}`, draft)).item
  },

  async removeWork(contractId: string, objectId: string, workId: string): Promise<Contract> {
    return (await http.delete<One>(`/contracts/${contractId}/objects/${objectId}/works/${workId}`)).item
  },
}
