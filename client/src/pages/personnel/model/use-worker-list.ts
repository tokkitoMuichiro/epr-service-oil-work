import { computed, ref, type Ref } from 'vue'
import {
  COMPLIANCE_STATE_LABEL,
  EMPLOYMENT_STATUS_LABEL,
  WORKER_STATUS_LABEL,
  type ComplianceState,
  type EmploymentStatus,
  type Worker,
  type WorkerSortKey,
  type WorkerStatus,
} from '@/entities/personnel'
import { NOT_ASSIGNED_LABEL, PROGRAM_STATE_LABEL, type ProgramState } from '@/entities/training'

export type SortDirection = 'asc' | 'desc'

export type TrainingFilter = '' | 'problem' | 'none' | ProgramState

export const TRAINING_FILTER_OPTIONS: { value: Exclude<TrainingFilter, ''>; label: string }[] = [
  { value: 'problem', label: 'Требуют внимания' },
  { value: 'valid', label: PROGRAM_STATE_LABEL.valid },
  { value: 'expiring', label: PROGRAM_STATE_LABEL.expiring },
  { value: 'expired', label: PROGRAM_STATE_LABEL.expired },
  { value: 'failed', label: PROGRAM_STATE_LABEL.failed },
  { value: 'assigned', label: PROGRAM_STATE_LABEL.assigned },
  { value: 'none', label: NOT_ASSIGNED_LABEL },
]

export const NO_BRIGADE = 'none'

/** «Есть замечания» covers every state except a fully valid set. */
export type ComplianceFilter = '' | 'problem' | ComplianceState

export const COMPLIANCE_FILTER_OPTIONS: { value: Exclude<ComplianceFilter, ''>; label: string }[] = [
  { value: 'problem', label: 'Есть замечания' },
  { value: 'missing', label: COMPLIANCE_STATE_LABEL.missing },
  { value: 'expired', label: COMPLIANCE_STATE_LABEL.expired },
  { value: 'expiring', label: COMPLIANCE_STATE_LABEL.expiring },
  { value: 'valid', label: 'Все допуски действуют' },
]

const collator = new Intl.Collator('ru', { sensitivity: 'base', numeric: true })

export function useWorkerList(
  workers: Ref<Worker[]>,
  brigadeName: (id: string | null) => string,
  complianceOf: (id: string) => ComplianceState | null,
  trainingOf: (id: string) => ProgramState | null = () => null,
) {
  const query = ref('')
  const employmentFilter = ref<'' | EmploymentStatus>('')
  const statusFilter = ref<'' | WorkerStatus>('')
  const brigadeFilter = ref('')
  const complianceFilter = ref<ComplianceFilter>('')
  const trainingFilter = ref<TrainingFilter>('')
  const sortKey = ref<WorkerSortKey>('fullName')
  const sortDirection = ref<SortDirection>('asc')

  function sortValue(worker: Worker, key: WorkerSortKey): string {
    switch (key) {
      case 'brigade':
        return worker.brigadeId ? brigadeName(worker.brigadeId) : ''
      case 'status':
        return WORKER_STATUS_LABEL[worker.status]
      case 'employment':
        return EMPLOYMENT_STATUS_LABEL[worker.employment]
      default:
        return worker[key]
    }
  }

  function matchesCompliance(worker: Worker): boolean {
    const filter = complianceFilter.value
    if (!filter) return true
    const state = complianceOf(worker.id)
    if (filter === 'problem') return state !== null && state !== 'valid'
    return state === filter
  }

  function matchesTraining(worker: Worker): boolean {
    const filter = trainingFilter.value
    if (!filter) return true
    const state = trainingOf(worker.id)
    if (filter === 'problem') return state === 'expiring' || state === 'expired' || state === 'failed'
    if (filter === 'none') return state === null
    return state === filter
  }

  const rows = computed(() => {
    const q = query.value.trim().toLowerCase()
    const filtered = workers.value.filter((w) => {
      if (employmentFilter.value && w.employment !== employmentFilter.value) return false
      if (statusFilter.value && w.status !== statusFilter.value) return false
      if (brigadeFilter.value === NO_BRIGADE && w.brigadeId) return false
      if (brigadeFilter.value && brigadeFilter.value !== NO_BRIGADE && w.brigadeId !== brigadeFilter.value) {
        return false
      }
      if (!matchesCompliance(w)) return false
      if (!matchesTraining(w)) return false
      if (!q) return true
      return [w.fullName, w.position, w.phone, sortValue(w, 'brigade')].some((v) => v.toLowerCase().includes(q))
    })
    const sign = sortDirection.value === 'asc' ? 1 : -1
    return filtered.sort((a, b) => {
      const left = sortValue(a, sortKey.value)
      const right = sortValue(b, sortKey.value)
      if (!left !== !right) return left ? -1 : 1
      return sign * collator.compare(left, right) || collator.compare(a.fullName, b.fullName)
    })
  })

  const activeFilterCount = computed(
    () =>
      [employmentFilter.value, statusFilter.value, brigadeFilter.value, complianceFilter.value, trainingFilter.value].filter(
        Boolean,
      ).length,
  )

  function toggleSort(key: WorkerSortKey) {
    if (sortKey.value === key) {
      sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
      return
    }
    sortKey.value = key
    sortDirection.value = 'asc'
  }

  function resetFilters() {
    employmentFilter.value = ''
    statusFilter.value = ''
    brigadeFilter.value = ''
    complianceFilter.value = ''
    trainingFilter.value = ''
  }

  return {
    query,
    employmentFilter,
    statusFilter,
    brigadeFilter,
    complianceFilter,
    trainingFilter,
    sortKey,
    sortDirection,
    rows,
    activeFilterCount,
    toggleSort,
    resetFilters,
  }
}
