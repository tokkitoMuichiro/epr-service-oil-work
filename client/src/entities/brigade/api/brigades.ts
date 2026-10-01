import { http } from '@/shared/api'
import type {
  AssignmentDraft,
  Brigade,
  BrigadeAssignment,
  BrigadeDraft,
  ObjectCrew,
} from '../model/types'

export interface AssignmentResult {
  item: BrigadeAssignment
  warnings: string[]
}

function withWarnings(result: { item: BrigadeAssignment; warnings?: string[] }): AssignmentResult {
  return { item: result.item, warnings: result.warnings ?? [] }
}

export const brigadesApi = {
  async list(): Promise<Brigade[]> {
    return (await http.get<{ items: Brigade[] }>('/brigades')).items
  },

  async create(draft: BrigadeDraft): Promise<Brigade> {
    return (await http.post<{ item: Brigade }>('/brigades', draft)).item
  },

  async update(id: string, draft: BrigadeDraft): Promise<Brigade> {
    return (await http.patch<{ item: Brigade }>(`/brigades/${id}`, draft)).item
  },

  async setArchived(id: string, archived: boolean): Promise<Brigade> {
    return (await http.patch<{ item: Brigade }>(`/brigades/${id}/archive`, { archived })).item
  },

  async remove(id: string): Promise<void> {
    await http.delete(`/brigades/${id}`)
  },
}

export const assignmentsApi = {
  async list(): Promise<BrigadeAssignment[]> {
    return (await http.get<{ items: BrigadeAssignment[] }>('/assignments')).items
  },

  async create(draft: AssignmentDraft): Promise<AssignmentResult> {
    return withWarnings(await http.post<AssignmentResult>('/assignments', draft))
  },

  async update(id: string, draft: AssignmentDraft): Promise<AssignmentResult> {
    return withWarnings(await http.patch<AssignmentResult>(`/assignments/${id}`, draft))
  },

  async remove(id: string): Promise<void> {
    await http.delete(`/assignments/${id}`)
  },

  async crew(objectId: string, date: string): Promise<ObjectCrew[]> {
    return (await http.get<{ items: ObjectCrew[] }>('/assignments/crew', { objectId, date })).items
  },
}
