<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAccessStore } from '@/entities/role'
import {
  ProgramStateBadge,
  useTrainingStore,
  type ProgramState,
  type ProgramStatus,
  type SummaryRow,
  type TrainingCounters,
} from '@/entities/training'
import { AssignTestDialog } from '@/features/training-assign'
import { formatDateRu } from '@/shared/lib/date'
import { useMobilePagination } from '@/shared/lib/pagination'
import { IconSearch, UiAvatar, UiButton, UiPagination, UiState } from '@/shared/ui'

/** One row per worker × programme; a worker without trainings gets a single row with `status: null`. */
interface SummaryItem {
  key: string
  row: SummaryRow
  status: ProgramStatus | null
}

type CounterKey = keyof TrainingCounters

const COUNTERS: { key: CounterKey; label: string; tone: string; state: ProgramState | null }[] = [
  { key: 'valid', label: 'Сдана', tone: 'ok', state: 'valid' },
  { key: 'expiring', label: 'Истекает', tone: 'warn', state: 'expiring' },
  { key: 'expired', label: 'Просрочена', tone: 'bad', state: 'expired' },
  { key: 'failed', label: 'Не сдана', tone: 'bad', state: 'failed' },
  { key: 'assigned', label: 'Назначена', tone: 'info', state: 'assigned' },
  { key: 'notAssigned', label: 'Не назначена', tone: 'neutral', state: null },
]

const ORDER: Record<ProgramState | 'none', number> = { failed: 0, expired: 1, expiring: 2, none: 3, assigned: 4, valid: 5 }

const store = useTrainingStore()
const access = useAccessStore()

const counter = ref<CounterKey | ''>('')
const programFilter = ref('')
const search = ref('')
const selected = ref<string[]>([])
const dialog = ref<{ workerIds: string[]; programId?: string } | null>(null)

const canAssign = computed(() => access.can('training_assign'))

onMounted(() => {
  void store.loadSummary()
})

const items = computed<SummaryItem[]>(() =>
  (store.summary?.rows ?? []).flatMap((row): SummaryItem[] =>
    row.statuses.length
      ? row.statuses.map((status) => ({ key: `${row.workerId}:${status.programId}`, row, status }))
      : [{ key: row.workerId, row, status: null }],
  ),
)

const programOptions = computed(() => {
  const ids = new Set(items.value.flatMap((i) => (i.status ? [i.status.programId] : [])))
  return store.programs.filter((p) => ids.has(p.id))
})

const visible = computed(() => {
  const q = search.value.trim().toLocaleLowerCase('ru')
  const definition = COUNTERS.find((c) => c.key === counter.value)
  return items.value
    .filter((i) => !programFilter.value || i.status?.programId === programFilter.value)
    .filter((i) => !q || i.row.fullName.toLocaleLowerCase('ru').includes(q))
    .filter((i) => !definition || (i.status?.state ?? null) === definition.state)
    .sort(
      (a, b) =>
        ORDER[a.status?.state ?? 'none'] - ORDER[b.status?.state ?? 'none'] ||
        (a.status?.nextDueAt ?? '').localeCompare(b.status?.nextDueAt ?? '') ||
        a.row.fullName.localeCompare(b.row.fullName, 'ru'),
    )
})

const pager = useMobilePagination(visible, { resetOn: [search, programFilter, counter] })

const selectable = computed(() => visible.value.filter((i) => !i.status?.activeAssignment))

const selectedSet = computed(() => new Set(selected.value))
const isAllSelected = computed(() => selectable.value.length > 0 && selectable.value.every((i) => selectedSet.value.has(i.key)))

function dueLabel(status: ProgramStatus | null): string {
  if (status?.activeAssignment) return `пройти до ${formatDateRu(status.activeAssignment.dueDate)}`
  if (status?.nextDueAt) return `действует до ${formatDateRu(status.nextDueAt)}`
  return ''
}

function toggle(key: string) {
  selected.value = selectedSet.value.has(key) ? selected.value.filter((k) => k !== key) : [...selected.value, key]
}

function toggleAll() {
  selected.value = isAllSelected.value ? [] : selectable.value.map((i) => i.key)
}

const selectedItems = computed(() => items.value.filter((i) => selectedSet.value.has(i.key)))

function openBulk() {
  const programIds = new Set(selectedItems.value.map((i) => i.status?.programId ?? ''))
  dialog.value = {
    workerIds: [...new Set(selectedItems.value.map((i) => i.row.workerId))],
    programId: programIds.size === 1 ? [...programIds][0] || undefined : undefined,
  }
}

function openOne(item: SummaryItem) {
  dialog.value = { workerIds: [item.row.workerId], programId: item.status?.programId }
}

function onAssigned() {
  selected.value = []
  void store.loadSummary()
}
</script>

<template>
  <div class="summary ui-fill-page">
    <UiState v-if="store.summaryStatus === 'loading' && !store.summary" kind="loading" title="Считаем сводку…" />
    <UiState v-else-if="store.summaryStatus === 'error'" kind="error" title="Не удалось загрузить сводку" :text="store.summaryError">
      <UiButton variant="primary" @click="store.loadSummary()">Повторить</UiButton>
    </UiState>

    <template v-else-if="store.summary">
      <div class="summary__counters ui-fill-chrome">
        <button
          v-for="c in COUNTERS"
          :key="c.key"
          type="button"
          class="counter"
          :class="[`counter--${c.tone}`, { 'is-active': counter === c.key }]"
          :aria-pressed="counter === c.key"
          @click="counter = counter === c.key ? '' : c.key"
        >
          <strong>{{ store.summary.counters[c.key] }}</strong>
          <span>{{ c.label }}</span>
        </button>
      </div>

      <div class="summary__toolbar ui-fill-chrome">
        <input v-model="search" class="summary__search ui-control" type="search" placeholder="Поиск по ФИО" aria-label="Поиск по ФИО" />
        <select v-model="programFilter" class="ui-control" aria-label="Программа">
          <option value="">Все программы</option>
          <option v-for="p in programOptions" :key="p.id" :value="p.id">{{ store.labelOf(p.id) }}</option>
        </select>
        <UiButton v-if="canAssign && selected.length" variant="primary" @click="openBulk">
          Назначить<span class="ui-hide-mobile">&nbsp;выбранным</span> ({{ selected.length }})
        </UiButton>
        <label v-if="canAssign && selectable.length" class="summary__select-all">
          <input type="checkbox" :checked="isAllSelected" @change="toggleAll" />
          Выбрать все доступные ({{ selectable.length }})
        </label>
      </div>

      <UiState v-if="!visible.length" title="Никого нет" :icon="IconSearch" text="По выбранным фильтрам сотрудников нет." />
      <div v-else class="summary__list ui-fill-panel">
        <div :ref="pager.bindFit" class="ui-table-wrap ui-table-wrap--stack ui-fill-scroll">
          <table class="ui-table">
            <thead>
              <tr>
                <th v-if="canAssign" class="summary__check">
                  <input type="checkbox" aria-label="Выбрать все" :checked="isAllSelected" @change="toggleAll" />
                </th>
                <th>Сотрудник</th>
                <th>Программа</th>
                <th>Статус</th>
                <th>Срок</th>
                <th v-if="canAssign" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in pager.pageItems" :key="item.key">
                <td v-if="canAssign" class="summary__check ui-cell--check">
                  <input
                    type="checkbox"
                    :aria-label="`Выбрать: ${item.row.fullName}`"
                    :disabled="Boolean(item.status?.activeAssignment)"
                    :checked="selectedSet.has(item.key)"
                    @change="toggle(item.key)"
                  />
                </td>
                <td class="summary__worker ui-cell--main">
                  <span class="summary__person">
                    <UiAvatar :name="item.row.fullName" />
                    <span class="summary__name">
                      <strong>{{ item.row.fullName }}</strong>
                      <small class="summary__position">{{ item.row.position }}</small>
                    </span>
                  </span>
                </td>
                <td class="summary__program" :class="{ 'ui-hide-mobile': !item.status }">
                  {{ item.status ? store.labelOf(item.status.programId) : '—' }}
                </td>
                <td class="ui-cell--aside"><ProgramStateBadge :state="item.status?.state ?? null" /></td>
                <td class="summary__due nowrap" :class="{ 'ui-hide-mobile': !dueLabel(item.status) }">
                  {{ dueLabel(item.status) || '—' }}
                </td>
                <td v-if="canAssign" class="summary__action">
                  <UiButton v-if="!item.status?.activeAssignment" variant="ghost" size="sm" @click="openOne(item)">Назначить</UiButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <UiPagination
          v-if="pager.isPaged"
          v-model:page="pager.page"
          class="ui-fill-chrome"
          :total="pager.total"
          :page-size="pager.pageSize"
        />
      </div>
    </template>

    <AssignTestDialog
      :open="dialog !== null"
      :worker-ids="dialog?.workerIds"
      :program-id="dialog?.programId"
      @close="dialog = null"
      @assigned="onAssigned"
    />
  </div>
</template>

<style scoped>
.summary {
  gap: var(--space-4);
}

.summary__list {
  gap: var(--space-3);
}

.summary__counters {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--space-3);
}

.counter {
  display: grid;
  gap: var(--space-1);
  min-height: 88px;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--status-neutral-solid);
  border-radius: var(--radius);
  background: var(--surface-card);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.counter strong {
  font-size: var(--font-size-2xl);
  line-height: 1;
}

.counter span {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.counter--bad {
  border-left-color: var(--status-bad-solid);
}

.counter--ok {
  border-left-color: var(--status-ok-solid);
}

.counter--warn {
  border-left-color: var(--status-warn-solid);
}

.counter--info {
  border-left-color: var(--status-info-solid);
}

.counter.is-active {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.summary__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.summary__toolbar .ui-control {
  width: auto;
  min-width: 220px;
}

.summary__toolbar :deep(.btn) {
  margin-left: auto;
}

.summary__check {
  width: 44px;
}

.summary__check input,
.summary__select-all input {
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--accent-strong);
}

.summary__select-all {
  display: none;
}

.summary__person {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.summary__name {
  min-width: 0;
}

.summary__position {
  display: block;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.summary__action {
  text-align: right;
}

.nowrap {
  white-space: nowrap;
}

@media (max-width: 1279px) {
  .summary__counters {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (hover: hover) and (pointer: fine) {
  .counter:hover {
    background: var(--surface-sunken);
  }
}

@media (max-width: 860px) {
  .summary {
    gap: var(--space-3);
  }

  .summary__counters {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-1);
  }

  .counter {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: var(--tap-size);
    padding: var(--space-1) var(--space-2);
  }

  .counter strong {
    font-size: var(--font-size-lg);
  }

  .counter span {
    min-width: 0;
    font-size: var(--font-size-2xs);
    line-height: var(--line-height-tight);
  }

  .summary__toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .summary__toolbar .ui-control {
    width: 100%;
    min-width: 0;
  }

  .summary__search {
    grid-column: 1 / -1;
  }

  .summary__toolbar :deep(.btn) {
    margin-left: 0;
  }

  .summary__select-all {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 36px;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }

  .summary .ui-table td.summary__worker {
    grid-row: 1 / span 2;
    align-self: start;
  }

  .ui-table td.summary__program,
  .ui-table td.summary__due {
    grid-column: 2 / -1;
  }

  .summary__due {
    color: var(--text-secondary);
  }

  .summary .ui-table td.summary__action {
    display: flex;
    grid-column: 3;
    grid-row: 2;
    justify-self: end;
    margin: var(--space-1) 0 0 var(--space-2);
  }

  .ui-table td.summary__check {
    width: auto;
  }

  .summary__check input {
    width: 20px;
    height: 20px;
    margin-top: 2px;
  }
}
</style>
