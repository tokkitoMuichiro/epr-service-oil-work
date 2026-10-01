import { apiUrl, http } from '@/shared/api'
import type {
  AssignmentResult,
  AssignmentView,
  CertificationRecord,
  DirectionDraft,
  DirectionWithPrograms,
  LinkView,
  ProgramDraft,
  QuestionImage,
  StorageCheck,
  TestAssignmentDraft,
  TestAttempt,
  TestContent,
  TestSummary,
  TrainingDirection,
  TrainingMaterial,
  TrainingProgram,
  TrainingSummary,
  TrainingTest,
  WorkerCertifications,
} from '../model/types'

type Item<T> = { item: T }
type Items<T> = { items: T[] }

export interface MaterialUpload {
  file: File
  title: string
  programIds: string[]
  description: string
}

export interface MaterialLink {
  url: string
  title: string
  programIds: string[]
  description: string
}

export interface AssignmentFilter {
  workerId?: string
  testId?: string
  programId?: string
  status?: string
  kind?: string
}

export const trainingApi = {
  async directions(): Promise<DirectionWithPrograms[]> {
    return (await http.get<Items<DirectionWithPrograms>>('/training/directions')).items
  },

  async createDirection(draft: DirectionDraft): Promise<TrainingDirection> {
    return (await http.post<Item<TrainingDirection>>('/training/directions', draft)).item
  },

  async updateDirection(id: string, patch: Partial<DirectionDraft> & { isArchived?: boolean }): Promise<TrainingDirection> {
    return (await http.patch<Item<TrainingDirection>>(`/training/directions/${id}`, patch)).item
  },

  async createProgram(directionId: string, draft: ProgramDraft): Promise<TrainingProgram> {
    return (await http.post<Item<TrainingProgram>>(`/training/directions/${directionId}/programs`, draft)).item
  },

  async updateProgram(
    directionId: string,
    programId: string,
    patch: Partial<ProgramDraft> & { isArchived?: boolean },
  ): Promise<TrainingProgram> {
    return (await http.patch<Item<TrainingProgram>>(`/training/directions/${directionId}/programs/${programId}`, patch)).item
  },

  async materials(): Promise<TrainingMaterial[]> {
    return (await http.get<Items<TrainingMaterial>>('/training/materials')).items
  },

  async uploadMaterial(upload: MaterialUpload): Promise<TrainingMaterial> {
    const { file, programIds, ...meta } = upload
    return (
      await http.upload<Item<TrainingMaterial>>('POST', '/training/materials/upload', file, {
        ...meta,
        programIds: programIds.join(','),
        fileName: file.name,
        mimeType: file.type,
      })
    ).item
  },

  async linkMaterial(link: MaterialLink): Promise<TrainingMaterial> {
    return (await http.post<Item<TrainingMaterial>>('/training/materials', link)).item
  },

  async updateMaterial(
    id: string,
    patch: Partial<Omit<MaterialLink, 'url'>> & { isArchived?: boolean },
  ): Promise<TrainingMaterial> {
    return (await http.patch<Item<TrainingMaterial>>(`/training/materials/${id}`, patch)).item
  },

  async removeMaterial(id: string): Promise<void> {
    await http.delete(`/training/materials/${id}`)
  },

  materialUrl(id: string): string {
    return apiUrl(`/training/materials/${id}/file`)
  },

  async tests(): Promise<TestSummary[]> {
    return (await http.get<Items<TestSummary>>('/training/tests')).items
  },

  async test(id: string): Promise<TrainingTest> {
    return (await http.get<Item<TrainingTest>>(`/training/tests/${id}`)).item
  },

  async createTest(content: TestContent): Promise<TrainingTest> {
    return (await http.post<Item<TrainingTest>>('/training/tests', content)).item
  },

  async updateTest(id: string, content: TestContent): Promise<TrainingTest> {
    return (await http.patch<Item<TrainingTest>>(`/training/tests/${id}`, content)).item
  },

  async publishTest(id: string): Promise<TrainingTest> {
    return (await http.post<Item<TrainingTest>>(`/training/tests/${id}/publish`)).item
  },

  async archiveTest(id: string): Promise<TrainingTest> {
    return (await http.post<Item<TrainingTest>>(`/training/tests/${id}/archive`)).item
  },

  async removeTest(id: string): Promise<void> {
    await http.delete(`/training/tests/${id}`)
  },

  async uploadImage(testId: string, file: File): Promise<QuestionImage> {
    return (
      await http.upload<Item<QuestionImage>>('POST', `/training/tests/${testId}/images`, file, {
        fileName: file.name,
        mimeType: file.type,
      })
    ).item
  },

  imageUrl(testId: string, fileId: string): string {
    return apiUrl(`/training/tests/${testId}/images/${encodeURIComponent(fileId)}`)
  },

  async assignments(filter: AssignmentFilter = {}): Promise<AssignmentView[]> {
    return (await http.get<Items<AssignmentView>>('/training/assignments', { ...filter })).items
  },

  async assign(draft: TestAssignmentDraft): Promise<AssignmentResult> {
    return http.post<AssignmentResult>('/training/assignments', draft)
  },

  async link(id: string): Promise<LinkView> {
    return (await http.get<Item<LinkView>>(`/training/assignments/${id}/link`)).item
  },

  async reissue(id: string): Promise<LinkView> {
    return (await http.post<Item<LinkView>>(`/training/assignments/${id}/reissue`)).item
  },

  async cancel(id: string, reason: string): Promise<AssignmentView> {
    return (await http.post<Item<AssignmentView>>(`/training/assignments/${id}/cancel`, { reason })).item
  },

  async workerCertifications(workerId: string): Promise<WorkerCertifications> {
    return (await http.get<Item<WorkerCertifications>>(`/training/workers/${workerId}/certifications`)).item
  },

  async attempt(id: string): Promise<TestAttempt> {
    return (await http.get<Item<TestAttempt>>(`/training/attempts/${id}`)).item
  },

  async annul(recordId: string, reason: string): Promise<CertificationRecord> {
    return (await http.post<Item<CertificationRecord>>(`/training/records/${recordId}/annul`, { reason })).item
  },

  async summary(): Promise<TrainingSummary> {
    return (await http.get<Item<TrainingSummary>>('/training/summary')).item
  },

  async checkStorage(): Promise<StorageCheck> {
    return (await http.get<Item<StorageCheck>>('/training/storage/check')).item
  },
}
