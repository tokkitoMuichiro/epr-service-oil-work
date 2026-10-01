import { apiUrl, http } from '@/shared/api'
import type { EmploymentStatus, QualificationTypeId, Worker, WorkerDraft } from '../model/types'

type One = { item: Worker }

export interface DocumentUpload {
  file: File
  title: string
  expiresAt?: string
  qualificationTypeId?: QualificationTypeId
  number?: string
  issuedAt?: string
  issuer?: string
  group?: string
}

export interface EmploymentResult {
  item: Worker
  warnings: string[]
}

export const personnelApi = {
  async list(): Promise<Worker[]> {
    return (await http.get<{ items: Worker[] }>('/personnel')).items
  },

  async create(draft: WorkerDraft): Promise<Worker> {
    return (await http.post<One>('/personnel', draft)).item
  },

  async update(id: string, draft: WorkerDraft): Promise<Worker> {
    return (await http.patch<One>(`/personnel/${id}`, draft)).item
  },

  async remove(id: string): Promise<void> {
    await http.delete(`/personnel/${id}`)
  },

  async setEmployment(id: string, employment: EmploymentStatus): Promise<EmploymentResult> {
    const result = await http.patch<Partial<EmploymentResult> & One>(`/personnel/${id}/employment`, { employment })
    return { item: result.item, warnings: result.warnings ?? [] }
  },

  async uploadDocument(id: string, upload: DocumentUpload): Promise<Worker> {
    const { file, ...meta } = upload
    return (
      await http.upload<One>('POST', `/personnel/${id}/documents`, file, {
        ...meta,
        fileName: file.name,
        mimeType: file.type,
      })
    ).item
  },

  async removeDocument(id: string, docId: string): Promise<Worker> {
    return (await http.delete<One>(`/personnel/${id}/documents/${docId}`)).item
  },

  async setPhoto(id: string, file: File): Promise<Worker> {
    return (await http.upload<One>('PUT', `/personnel/${id}/photo`, file, { mimeType: file.type })).item
  },

  async removePhoto(id: string): Promise<Worker> {
    return (await http.delete<One>(`/personnel/${id}/photo`)).item
  },

  documentUrl(id: string, docId: string): string {
    return apiUrl(`/personnel/${id}/documents/${docId}/file`)
  },

  photoUrl(worker: Pick<Worker, 'id' | 'photoUpdatedAt'>): string | null {
    return worker.photoUpdatedAt
      ? `${apiUrl(`/personnel/${worker.id}/photo`)}?v=${encodeURIComponent(worker.photoUpdatedAt)}`
      : null
  },
}
