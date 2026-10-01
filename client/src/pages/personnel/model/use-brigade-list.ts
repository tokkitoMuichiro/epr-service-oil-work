import { computed, ref, type Ref } from 'vue'
import {
  BRIGADE_STATUS_LABEL,
  brigadeLeaderIds,
  brigadeStatus,
  type Brigade,
  type BrigadeAssignment,
  type BrigadeStatus,
} from '@/entities/brigade'
import type { SortDirection } from './use-worker-list'

export type BrigadeSortKey = 'name' | 'status' | 'size' | 'leader'

export interface BrigadeRow {
  brigade: Brigade
  status: BrigadeStatus
  size: number
  leader: string
  leaderRole: string
}

const STATUS_RANK = Object.keys(BRIGADE_STATUS_LABEL) as BrigadeStatus[]

const collator = new Intl.Collator('ru', { sensitivity: 'base', numeric: true })

function leaderRole(isMasters: boolean, count: number): string {
  if (isMasters) return count > 1 ? 'Мастера' : 'Мастер'
  return count > 1 ? 'Бригадиры' : 'Бригадир'
}

function compareRows(a: BrigadeRow, b: BrigadeRow, key: BrigadeSortKey): number {
  switch (key) {
    case 'status':
      return STATUS_RANK.indexOf(a.status) - STATUS_RANK.indexOf(b.status)
    case 'size':
      return a.size - b.size
    case 'leader':
      if (!a.leader !== !b.leader) return a.leader ? -1 : 1
      return collator.compare(a.leader, b.leader)
    default:
      return collator.compare(a.brigade.name, b.brigade.name)
  }
}

export function useBrigadeList(
  brigades: Ref<Brigade[]>,
  assignments: Ref<BrigadeAssignment[]>,
  today: Ref<string>,
  workerName: (id: string) => string,
) {
  const sortKey = ref<BrigadeSortKey>('name')
  const sortDirection = ref<SortDirection>('asc')

  const rows = computed<BrigadeRow[]>(() => {
    const sign = sortDirection.value === 'asc' ? 1 : -1
    return brigades.value
      .map((brigade) => {
        const leaderIds = brigadeLeaderIds(brigade)
        return {
          brigade,
          status: brigadeStatus(brigade.id, assignments.value, today.value),
          size: brigade.memberIds.length,
          leader: leaderIds.map(workerName).join(', '),
          leaderRole: leaderRole(brigade.masterIds.length > 0, leaderIds.length),
        }
      })
      .sort(
        (a, b) =>
          Number(Boolean(a.brigade.archived)) - Number(Boolean(b.brigade.archived)) ||
          sign * compareRows(a, b, sortKey.value) ||
          collator.compare(a.brigade.name, b.brigade.name),
      )
  })

  function toggleSort(key: BrigadeSortKey) {
    if (sortKey.value === key) {
      sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
      return
    }
    sortKey.value = key
    sortDirection.value = 'asc'
  }

  return { sortKey, sortDirection, rows, toggleSort }
}
