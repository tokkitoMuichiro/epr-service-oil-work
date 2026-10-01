import { http } from '@/shared/api'
import type { Contract, ContractDraft, ObjectDraft, ObjectPatch, WorkDraft } from '../model/types'

type One = { item: Contract }

export const contractsApi = {
  async list(): Promise<Contract[]> {
    return (await http.get<{ items: Contract[] }>('/contracts')).items
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
