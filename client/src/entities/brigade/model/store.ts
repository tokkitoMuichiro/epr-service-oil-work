import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ApiError, errorMessage } from '@/shared/api'
import { assignmentsApi, brigadesApi } from '../api/brigades'
import type { AssignmentDraft, AssignmentIssue, Brigade, BrigadeAssignment, BrigadeDraft } from './types'

export const useBrigadesStore = defineStore('brigades', () => {
  const brigades = ref<Brigade[]>([])
  const assignments = ref<BrigadeAssignment[]>([])
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const errorText = ref('')
  const actionError = ref('')
  const busy = ref(false)
  /** Qualification problems from the last rejected assignment (409). */
  const assignmentIssues = ref<AssignmentIssue[]>([])
  const canOverride = ref(false)
  /** Non-blocking warnings of the last saved assignment. */
  const notices = ref<string[]>([])

  const activeBrigades = computed(() => brigades.value.filter((b) => !b.archived))

  async function load() {
    status.value = 'loading'
    errorText.value = ''
    try {
      const [b, a] = await Promise.all([brigadesApi.list(), assignmentsApi.list()])
      brigades.value = b
      assignments.value = a
      status.value = 'ready'
    } catch (e) {
      status.value = 'error'
      errorText.value = errorMessage(e, 'Ошибка загрузки')
    }
  }

  function clearFeedback() {
    actionError.value = ''
    assignmentIssues.value = []
    canOverride.value = false
    notices.value = []
  }

  async function mutate(action: () => Promise<void>): Promise<boolean> {
    busy.value = true
    clearFeedback()
    try {
      await action()
      return true
    } catch (e) {
      actionError.value = errorMessage(e, 'Не удалось сохранить')
      if (e instanceof ApiError && Array.isArray(e.details.issues)) {
        assignmentIssues.value = e.details.issues as AssignmentIssue[]
        canOverride.value = e.details.canOverride === true
      }
      return false
    } finally {
      busy.value = false
    }
  }

  async function createBrigade(draft: BrigadeDraft): Promise<Brigade | null> {
    let created = null as Brigade | null
    const isSaved = await mutate(async () => {
      created = await brigadesApi.create(draft)
      brigades.value = [...brigades.value, created]
    })
    return isSaved ? created : null
  }

  function replaceBrigade(updated: Brigade) {
    brigades.value = brigades.value.map((b) => (b.id === updated.id ? updated : b))
  }

  function updateBrigade(id: string, draft: BrigadeDraft) {
    return mutate(async () => replaceBrigade(await brigadesApi.update(id, draft)))
  }

  function setBrigadeArchived(id: string, archived: boolean) {
    return mutate(async () => {
      replaceBrigade(await brigadesApi.setArchived(id, archived))
      assignments.value = await assignmentsApi.list()
    })
  }

  function removeBrigade(id: string) {
    return mutate(async () => {
      await brigadesApi.remove(id)
      brigades.value = brigades.value.filter((b) => b.id !== id)
      assignments.value = assignments.value.filter((a) => a.brigadeId !== id)
    })
  }

  function createAssignment(draft: AssignmentDraft) {
    return mutate(async () => {
      const { item, warnings } = await assignmentsApi.create(draft)
      assignments.value = [...assignments.value, item]
      notices.value = warnings
    })
  }

  function updateAssignment(id: string, draft: AssignmentDraft) {
    return mutate(async () => {
      const { item, warnings } = await assignmentsApi.update(id, draft)
      assignments.value = assignments.value.map((a) => (a.id === id ? item : a))
      notices.value = warnings
    })
  }

  function removeAssignment(id: string) {
    return mutate(async () => {
      await assignmentsApi.remove(id)
      assignments.value = assignments.value.filter((a) => a.id !== id)
    })
  }

  function brigadeName(id: string | null | undefined) {
    return brigades.value.find((b) => b.id === id)?.name ?? '—'
  }

  function assignmentsForObject(objectId: string) {
    return assignments.value.filter((a) => a.objectId === objectId)
  }

  function assignmentsForBrigade(brigadeId: string) {
    return assignments.value.filter((a) => a.brigadeId === brigadeId)
  }

  return {
    brigades,
    activeBrigades,
    assignments,
    status,
    errorText,
    actionError,
    busy,
    assignmentIssues,
    canOverride,
    notices,
    load,
    clearFeedback,
    createBrigade,
    updateBrigade,
    setBrigadeArchived,
    removeBrigade,
    createAssignment,
    updateAssignment,
    removeAssignment,
    brigadeName,
    assignmentsForObject,
    assignmentsForBrigade,
  }
})
