import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { todayIso } from '@shared/dates'
import { errorMessage } from '@/shared/api'
import { personnelApi, type DocumentUpload } from '../api/personnel'
import {
  complianceSummary,
  workerAttention,
  workerCompliance,
  type ComplianceState,
  type EmploymentStatus,
  type PositionRequirement,
  type QualificationCheck,
  type Worker,
  type WorkerDraft,
} from './types'

export type WorkerSortKey = 'fullName' | 'position' | 'brigade' | 'phone' | 'status' | 'employment'

export const usePersonnelStore = defineStore('personnel', () => {
  const workers = ref<Worker[]>([])
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const errorText = ref('')
  const actionError = ref('')
  const busy = ref(false)
  const profileId = ref<string | null>(null)
  const requirements = ref<PositionRequirement[]>([])
  /** Non-blocking server warnings of the last action (e.g. equipment still registered to a fired worker). */
  const notices = ref<string[]>([])

  const today = computed(() => todayIso())

  const complianceById = computed(() => {
    const map = new Map<string, { checks: QualificationCheck[]; state: ComplianceState | null }>()
    for (const w of workers.value) {
      const checks = workerCompliance(w, requirements.value, today.value)
      map.set(w.id, { checks, state: complianceSummary(checks) })
    }
    return map
  })

  function complianceOf(id: string) {
    return complianceById.value.get(id) ?? { checks: [], state: null }
  }

  const profileWorker = computed(() => workers.value.find((w) => w.id === profileId.value) ?? null)

  const isEmpty = computed(() => status.value === 'ready' && workers.value.length === 0)

  const attentionCount = computed(
    () => workers.value.filter((w) => workerAttention(w, today.value) !== null).length,
  )

  async function load() {
    status.value = 'loading'
    errorText.value = ''
    try {
      const [list, catalog] = await Promise.all([personnelApi.list(), personnelApi.qualifications()])
      workers.value = list
      requirements.value = catalog.requirements
      status.value = 'ready'
      if (!workers.value.some((w) => w.id === profileId.value)) profileId.value = null
    } catch (e) {
      status.value = 'error'
      errorText.value = errorMessage(e, 'Ошибка загрузки')
    }
  }

  async function refresh() {
    try {
      workers.value = await personnelApi.list()
    } catch (e) {
      actionError.value = errorMessage(e, 'Не удалось обновить список')
    }
  }

  function replace(worker: Worker) {
    const idx = workers.value.findIndex((w) => w.id === worker.id)
    if (idx >= 0) workers.value[idx] = worker
    else workers.value = [worker, ...workers.value]
  }

  async function mutate(action: () => Promise<void>): Promise<boolean> {
    busy.value = true
    actionError.value = ''
    notices.value = []
    try {
      await action()
      return true
    } catch (e) {
      actionError.value = errorMessage(e, 'Не удалось сохранить')
      return false
    } finally {
      busy.value = false
    }
  }

  function openProfile(id: string | null) {
    actionError.value = ''
    profileId.value = id
  }

  function createWorker(draft: WorkerDraft) {
    return mutate(async () => {
      const worker = await personnelApi.create(draft)
      replace(worker)
      profileId.value = worker.id
    })
  }

  function updateWorker(id: string, draft: WorkerDraft) {
    return mutate(async () => replace(await personnelApi.update(id, draft)))
  }

  function removeWorker(id: string) {
    return mutate(async () => {
      await personnelApi.remove(id)
      workers.value = workers.value.filter((w) => w.id !== id)
      if (profileId.value === id) profileId.value = null
    })
  }

  function setEmployment(id: string, employment: EmploymentStatus) {
    return mutate(async () => {
      const { item, warnings } = await personnelApi.setEmployment(id, employment)
      replace(item)
      notices.value = warnings
    })
  }

  async function loadRequirements() {
    requirements.value = (await personnelApi.qualifications()).requirements
  }

  async function saveRequirements(next: PositionRequirement[]) {
    requirements.value = await personnelApi.setRequirements(next)
  }

  function uploadDocuments(id: string, uploads: DocumentUpload[]) {
    return mutate(async () => {
      for (const upload of uploads) replace(await personnelApi.uploadDocument(id, upload))
    })
  }

  function removeDocument(id: string, docId: string) {
    return mutate(async () => replace(await personnelApi.removeDocument(id, docId)))
  }

  function setPhoto(id: string, file: File) {
    return mutate(async () => replace(await personnelApi.setPhoto(id, file)))
  }

  function removePhoto(id: string) {
    return mutate(async () => replace(await personnelApi.removePhoto(id)))
  }

  function workerName(id: string | null | undefined) {
    return workers.value.find((w) => w.id === id)?.fullName ?? '—'
  }

  return {
    workers,
    status,
    errorText,
    actionError,
    busy,
    profileId,
    profileWorker,
    requirements,
    notices,
    complianceOf,
    loadRequirements,
    saveRequirements,
    today,
    isEmpty,
    attentionCount,
    load,
    refresh,
    openProfile,
    createWorker,
    updateWorker,
    removeWorker,
    setEmployment,
    uploadDocuments,
    removeDocument,
    setPhoto,
    removePhoto,
    workerName,
  }
})
