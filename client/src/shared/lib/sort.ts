import { ref } from 'vue'

export type SortDirection = 'asc' | 'desc'

export function useColumnSort<K extends string>(initial: K, initialDir: SortDirection = 'asc') {
  const sortKey = ref(initial)
  const sortDirection = ref<SortDirection>(initialDir)

  function toggleSort(key: K) {
    if (sortKey.value === key) {
      sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
      return
    }
    sortKey.value = key
    sortDirection.value = 'asc'
  }

  function ariaSort(key: K) {
    if (sortKey.value !== key) return 'none' as const
    return sortDirection.value === 'asc' ? ('ascending' as const) : ('descending' as const)
  }

  function arrow(key: K) {
    if (sortKey.value !== key) return '↕'
    return sortDirection.value === 'asc' ? '▲' : '▼'
  }

  return { sortKey, sortDirection, toggleSort, ariaSort, arrow }
}

export function compareLocale(a: string, b: string, direction: SortDirection) {
  const sign = direction === 'asc' ? 1 : -1
  return sign * a.localeCompare(b, 'ru', { numeric: true, sensitivity: 'base' })
}

export function compareNumber(a: number, b: number, direction: SortDirection) {
  return direction === 'asc' ? a - b : b - a
}
