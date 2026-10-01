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
import { UiButton, UiState } from '@/shared/ui'

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

const selectable = computed(() => visible.value.filter((i) => !i.status?.activeAssignment))

const selectedSet = computed(() => new Set(selected.value))

function toggle(key: string) {
  selected.value = selectedSet.value.has(key) ? selected.value.filter((k) => k !== key) : [...selected.value, key]
}

function toggleAll() {
  const keys = selectable.value.map((i) => i.key)
  selected.value = keys.every((k) => selectedSet.value.has(k)) ? [] : keys
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
  <div class="summary">
    <UiState v-if="store.summaryStatus === 'loading' && !store.summary" kind="loading" title="Считаем сводку…" />
    <UiState v-else-if="store.summaryStatus === 'error'" kind="error" title="Не удалось загрузить сводку" :text="store.summaryError">
      <UiButton variant="primary" @click="store.loadSummary()">Повторить</UiButton>
    </UiState>

    <template v-else-if="store.summary">
      <div class="summary__counters">
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

      <div class="summary__toolbar">
        <input v-model="search" class="ui-control" type="search" placeholder="Поиск по ФИО" aria-label="Поиск по ФИО" />
        <select v-model="programFilter" class="ui-control" aria-label="Программа">
          <option value="">Все программы</option>
          <option v-for="p in programOptions" :key="p.id" :value="p.id">{{ store.labelOf(p.id) }}</option>
        </select>
        <UiButton v-if="canAssign" variant="primary" :disabled="!selected.length" @click="openBulk">
          Назначить выбранным ({{ selected.length }})
        </UiButton>
      </div>

      <UiState v-if="!visible.length" title="Никого нет" text="По выбранным фильтрам сотрудников нет." />
      <div v-else class="ui-table-wrap">
        <table class="ui-table">
          <thead>
            <tr>
              <th v-if="canAssign" class="summary__check">
                <input
                  type="checkbox"
                  aria-label="Выбрать все"
                  :checked="selectable.length > 0 && selectable.every((i) => selectedSet.has(i.key))"
                  @change="toggleAll"
                />
              </th>
              <th>Сотрудник</th>
              <th>Программа</th>
              <th>Статус</th>
              <th class="summary__hide-sm">Срок</th>
              <th v-if="canAssign" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in visible" :key="item.key">
              <td v-if="canAssign" class="summary__check">
                <input
                  type="checkbox"
                  :aria-label="`Выбрать: ${item.row.fullName}`"
                  :disabled="Boolean(item.status?.activeAssignment)"
                  :checked="selectedSet.has(item.key)"
                  @change="toggle(item.key)"
                />
              </td>
              <td>
                <strong>{{ item.row.fullName }}</strong>
                <small class="summary__position">{{ item.row.position }}</small>
              </td>
              <td>{{ item.status ? store.labelOf(item.status.programId) : '—' }}</td>
              <td><ProgramStateBadge :state="item.status?.state ?? null" /></td>
              <td class="summary__hide-sm nowrap">
                <template v-if="item.status?.activeAssignment">
                  пройти до {{ formatDateRu(item.status.activeAssignment.dueDate) }}
                </template>
                <template v-else-if="item.status?.nextDueAt">действует до {{ formatDateRu(item.status.nextDueAt) }}</template>
                <template v-else>—</template>
              </td>
              <td v-if="canAssign" class="summary__action">
                <UiButton v-if="!item.status?.activeAssignment" variant="ghost" size="sm" @click="openOne(item)">Назначить</UiButton>
              </td>
            </tr>
          </tbody>
        </table>
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
  display: grid;
  gap: var(--space-4);
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

.summary__check input {
  width: 18px;
  height: 18px;
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
  .summary__counters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .summary__toolbar .ui-control {
    flex: 1 1 100%;
    min-width: 0;
  }

  .summary__toolbar :deep(.btn) {
    flex: 1 1 100%;
    margin-left: 0;
  }

  .summary__hide-sm {
    display: none;
  }
}
</style>
