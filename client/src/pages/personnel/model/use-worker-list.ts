import { computed, ref, type Ref } from 'vue'
import {
  EMPLOYMENT_STATUS_LABEL,
  WORKER_STATUS_LABEL,
  type EmploymentStatus,
  type Worker,
  type WorkerSortKey,
  type WorkerStatus,
} from '@/entities/personnel'
import type { TestingMark } from '@/entities/training'

export type SortDirection = 'asc' | 'desc'

export type TestingFilter = '' | TestingMark

export const TESTING_FILTER_OPTIONS: { value: TestingMark; label: string }[] = [
  { value: 'passed', label: 'Пройдено' },
  { value: 'expiring', label: 'Истекает' },
  { value: 'none', label: 'Не пройдено или не назначено' },
]

export const NO_BRIGADE = 'none'

const collator = new Intl.Collator('ru', { sensitivity: 'base', numeric: true })

export function useWorkerList(
  workers: Ref<Worker[]>,
  brigadeName: (id: string | null) => string,
  testingOf: (id: string) => TestingMark = () => 'none',
) {
  const query = ref('')
  const employmentFilter = ref<'' | EmploymentStatus>('')
  const statusFilter = ref<'' | WorkerStatus>('')
  const brigadeFilter = ref('')
  const testingFilter = ref<TestingFilter>('')
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

  const rows = computed(() => {
    const q = query.value.trim().toLowerCase()
    const filtered = workers.value.filter((w) => {
      if (employmentFilter.value && w.employment !== employmentFilter.value) return false
      if (statusFilter.value && w.status !== statusFilter.value) return false
      if (brigadeFilter.value === NO_BRIGADE && w.brigadeId) return false
      if (brigadeFilter.value && brigadeFilter.value !== NO_BRIGADE && w.brigadeId !== brigadeFilter.value) {
        return false
      }
      if (testingFilter.value && testingOf(w.id) !== testingFilter.value) return false
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
    () => [employmentFilter.value, statusFilter.value, brigadeFilter.value, testingFilter.value].filter(Boolean).length,
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
    testingFilter.value = ''
  }

  return {
    query,
    employmentFilter,
    statusFilter,
    brigadeFilter,
    testingFilter,
    sortKey,
    sortDirection,
    rows,
    activeFilterCount,
    toggleSort,
    resetFilters,
  }
}
