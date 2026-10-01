<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { BrigadeStatusBadge, useBrigadesStore } from '@/entities/brigade'
import { useContractsStore } from '@/entities/contract'
import {
  ComplianceBadge,
  EMPLOYMENT_STATUS_LABEL,
  TRAINING_EXPIRING_DAYS,
  WorkerStatusBadge,
  usePersonnelStore,
  workerAttention,
  type WorkerDraft,
  type WorkerSortKey,
} from '@/entities/personnel'
import { useAccessStore, useRoleStore } from '@/entities/role'
import { ProgramStateBadge, useTrainingStore } from '@/entities/training'
import { WorkerFormDialog } from '@/features/worker-form'
import { IconClose, IconSearch, UiButton, UiState } from '@/shared/ui'
import { BrigadeProfileDialog, NEW_BRIGADE } from '@/widgets/brigade-profile'
import { WorkerCertifications } from '@/widgets/worker-certifications'
import { WorkerProfileDialog } from '@/widgets/worker-profile'
import { useBrigadeList, type BrigadeSortKey } from '../model/use-brigade-list'
import { useWorkerList } from '../model/use-worker-list'
import WorkerFilters from './WorkerFilters.vue'

type TabId = 'workers' | 'brigades'

const personnel = usePersonnelStore()
const brigadesStore = useBrigadesStore()
const contracts = useContractsStore()
const roleStore = useRoleStore()

const { workers, status, errorText, actionError, notices, busy, isEmpty, attentionCount, today, profileId } =
  storeToRefs(personnel)
const { brigades, assignments, actionError: brigadeError } = storeToRefs(brigadesStore)
const { currentRole, piiVisible } = storeToRefs(roleStore)

const access = useAccessStore()
const training = useTrainingStore()
const showTraining = computed(() => access.canView('training'))
const PROFILE_TRAINING_TABS = [
  { id: 'training', label: 'Обучение' },
  { id: 'testing', label: 'Тестирование' },
] as const
const profileTabs = computed(() => (showTraining.value ? [...PROFILE_TRAINING_TABS] : []))
const trainingByWorker = computed(
  () => new Map((training.summary?.rows ?? []).map((row) => [row.workerId, row.worst])),
)

function trainingOf(workerId: string) {
  return trainingByWorker.value.get(workerId) ?? null
}

const list = useWorkerList(workers, brigadeName, (id) => personnel.complianceOf(id).state, trainingOf)
const {
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
} = list

const COLUMNS: { key: WorkerSortKey; label: string }[] = [
  { key: 'fullName', label: 'ФИО' },
  { key: 'position', label: 'Должность' },
  { key: 'brigade', label: 'Бригада' },
  { key: 'phone', label: 'Телефон' },
  { key: 'status', label: 'Занятость' },
  { key: 'employment', label: 'В компании' },
]

function ariaSort(key: WorkerSortKey) {
  if (sortKey.value !== key) return 'none'
  return sortDirection.value === 'asc' ? 'ascending' : 'descending'
}

const brigadeList = useBrigadeList(brigades, assignments, today, (id) => personnel.workerName(id))
const { sortKey: brigadeSortKey, sortDirection: brigadeSortDirection, rows: brigadeRows } = brigadeList

const BRIGADE_COLUMNS: { key: BrigadeSortKey; label: string }[] = [
  { key: 'name', label: 'Наименование' },
  { key: 'status', label: 'Статус' },
  { key: 'size', label: 'Кол-во людей' },
  { key: 'leader', label: 'Руководитель' },
]

function brigadeAriaSort(key: BrigadeSortKey) {
  if (brigadeSortKey.value !== key) return 'none'
  return brigadeSortDirection.value === 'asc' ? 'ascending' : 'descending'
}

const tab = ref<TabId>('workers')
const workerDialogOpen = ref(false)
const openBrigadeId = ref<string | null>(null)

const canEdit = computed(() => access.can('personnel_edit'))
const canPlan = computed(() => access.can('brigades_plan'))

function loadTraining() {
  if (showTraining.value) void training.loadSummary()
}

onMounted(() => {
  void personnel.load()
  void brigadesStore.load()
  if (contracts.status === 'idle') void contracts.load()
  loadTraining()
})

watch(currentRole, () => {
  void personnel.load()
})

watch(showTraining, loadTraining)

watch(profileId, (id, previous) => {
  if (!id && previous) loadTraining()
})

function brigadeName(id: string | null) {
  return id ? brigadesStore.brigadeName(id) : '—'
}

function openCreateWorker() {
  personnel.actionError = ''
  workerDialogOpen.value = true
}

async function saveWorker(draft: WorkerDraft) {
  if (await personnel.createWorker(draft)) workerDialogOpen.value = false
}

function openCreateBrigade() {
  openBrigadeId.value = NEW_BRIGADE
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>Персонал</h1>
        <p>Карточки сотрудников, документы и бригады.</p>
      </div>
      <div class="page__actions">
        <UiButton v-if="tab === 'workers' && canEdit" variant="primary" @click="openCreateWorker">
          Добавить сотрудника
        </UiButton>
        <UiButton v-if="tab === 'brigades' && canPlan" variant="primary" @click="openCreateBrigade">
          Новая бригада
        </UiButton>
      </div>
    </header>

    <div class="tabs ui-segmented" role="tablist" aria-label="Разделы персонала">
      <button
        type="button"
        class="tabs__btn"
        :class="{ 'tabs__btn--active': tab === 'workers' }"
        role="tab"
        :aria-selected="tab === 'workers'"
        @click="tab = 'workers'"
      >
        Сотрудники
        <span v-if="attentionCount" class="tabs__badge" title="Истекающие или просроченные документы">
          {{ attentionCount }}
        </span>
      </button>
      <button
        type="button"
        class="tabs__btn"
        :class="{ 'tabs__btn--active': tab === 'brigades' }"
        role="tab"
        :aria-selected="tab === 'brigades'"
        @click="tab = 'brigades'"
      >
        Бригады
      </button>
    </div>

    <p v-if="actionError && !profileId && !workerDialogOpen" class="alert" role="alert">
      {{ actionError }}
      <button type="button" aria-label="Скрыть" @click="personnel.actionError = ''"><IconClose :size="16" /></button>
    </p>
    <div v-if="notices.length && !profileId" class="notice" role="status">
      <ul>
        <li v-for="n in notices" :key="n">{{ n }}</li>
      </ul>
      <button type="button" aria-label="Скрыть" @click="personnel.notices = []"><IconClose :size="16" /></button>
    </div>
    <p v-if="brigadeError && !openBrigadeId" class="alert" role="alert">
      {{ brigadeError }}
      <button type="button" aria-label="Скрыть" @click="brigadesStore.actionError = ''"><IconClose :size="16" /></button>
    </p>

    <UiState v-if="status === 'loading'" kind="loading" title="Загрузка персонала…" text="Получаем карточки с сервера ERP." />

    <UiState v-else-if="status === 'error'" kind="error" title="Не удалось загрузить" :text="errorText">
      <UiButton variant="primary" @click="personnel.load()">Повторить</UiButton>
    </UiState>

    <template v-else-if="tab === 'workers'">
      <UiState v-if="isEmpty" title="Сотрудников пока нет" text="Добавьте первую карточку сотрудника.">
        <UiButton v-if="canEdit" variant="primary" @click="openCreateWorker">Добавить</UiButton>
      </UiState>

      <div v-else class="panel">
        <div class="toolbar">
          <label class="search">
            <IconSearch class="search__icon" :size="18" />
            <input
              v-model="query"
              type="search"
              placeholder="Поиск: ФИО, должность, телефон, бригада"
              aria-label="Поиск сотрудников"
              @keydown.esc="query = ''"
            />
            <button
              v-if="query"
              type="button"
              class="search__clear"
              aria-label="Очистить поиск"
              title="Очистить"
              @click="query = ''"
            >
              <IconClose :size="18" />
            </button>
          </label>
          <WorkerFilters
            v-model:employment="employmentFilter"
            v-model:status="statusFilter"
            v-model:brigade="brigadeFilter"
            v-model:compliance="complianceFilter"
            v-model:training="trainingFilter"
            :show-training="showTraining"
            :brigades="brigades"
            :active-count="activeFilterCount"
            @reset="list.resetFilters"
          />
        </div>

        <p class="legend">
          <span><i class="legend__swatch legend__swatch--expiring" />Документ истекает в течение {{ TRAINING_EXPIRING_DAYS }} дней</span>
          <span><i class="legend__swatch legend__swatch--expired" />Документ просрочен</span>
          <span class="legend__count">Показано: {{ rows.length }} из {{ workers.length }}</span>
        </p>

        <UiState v-if="!rows.length" title="Ничего не найдено" text="Измените поиск или фильтры." />

        <div v-else class="table-wrap ui-table-wrap">
          <table class="table--workers">
            <thead>
              <tr>
                <th
                  v-for="column in COLUMNS"
                  :key="column.key"
                  :class="`col--${column.key}`"
                  :aria-sort="ariaSort(column.key)"
                >
                  <button
                    type="button"
                    class="sort"
                    :class="{ 'sort--active': sortKey === column.key }"
                    @click="list.toggleSort(column.key)"
                  >
                    {{ column.label }}
                    <span class="sort__arrow" aria-hidden="true">
                      {{ sortKey === column.key ? (sortDirection === 'asc' ? '▲' : '▼') : '↕' }}
                    </span>
                  </button>
                </th>
                <th class="col--compliance"><span class="sort sort--static">Допуски</span></th>
                <th v-if="showTraining" class="col--training"><span class="sort sort--static">Проверка знаний</span></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="w in rows"
                :key="w.id"
                :class="workerAttention(w, today) ? `row--${workerAttention(w, today)}` : ''"
                tabindex="0"
                @click="personnel.openProfile(w.id)"
                @keydown.enter="personnel.openProfile(w.id)"
              >
                <td data-label="ФИО"><strong>{{ w.fullName }}</strong></td>
                <td data-label="Должность">{{ w.position }}</td>
                <td data-label="Бригада">{{ brigadeName(w.brigadeId) }}</td>
                <td class="nowrap col--phone" data-label="Телефон">{{ w.phone || '—' }}</td>
                <td data-label="Занятость"><WorkerStatusBadge :status="w.status" /></td>
                <td class="nowrap" data-label="В компании">{{ EMPLOYMENT_STATUS_LABEL[w.employment] }}</td>
                <td class="nowrap" data-label="Допуски">
                  <ComplianceBadge :state="personnel.complianceOf(w.id).state" />
                </td>
                <td v-if="showTraining" class="nowrap col--training" data-label="Проверка знаний">
                  <ProgramStateBadge v-if="w.employment !== 'fired'" :state="trainingOf(w.id)" />
                  <template v-else>—</template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <template v-else>
      <UiState
        v-if="!brigades.length"
        title="Бригад пока нет"
        text="Соберите бригаду из сотрудников и назначьте бригадира."
      >
        <UiButton v-if="canPlan" variant="primary" @click="openCreateBrigade">Новая бригада</UiButton>
      </UiState>

      <div v-else class="panel">
        <div class="table-wrap ui-table-wrap">
          <table class="table--brigades">
            <thead>
              <tr>
                <th v-for="column in BRIGADE_COLUMNS" :key="column.key" :aria-sort="brigadeAriaSort(column.key)">
                  <button
                    type="button"
                    class="sort"
                    :class="{ 'sort--active': brigadeSortKey === column.key }"
                    @click="brigadeList.toggleSort(column.key)"
                  >
                    {{ column.label }}
                    <span class="sort__arrow" aria-hidden="true">
                      {{ brigadeSortKey === column.key ? (brigadeSortDirection === 'asc' ? '▲' : '▼') : '↕' }}
                    </span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in brigadeRows"
                :key="row.brigade.id"
                :class="{ 'row--archived': row.brigade.archived }"
                tabindex="0"
                @click="openBrigadeId = row.brigade.id"
                @keydown.enter="openBrigadeId = row.brigade.id"
              >
                <td data-label="Наименование"><strong>{{ row.brigade.name }}</strong></td>
                <td data-label="Статус">
                  <span v-if="row.brigade.archived" class="ui-badge ui-badge--neutral">Архив</span>
                  <BrigadeStatusBadge v-else :status="row.status" />
                </td>
                <td class="num" data-label="Кол-во людей">{{ row.size }}</td>
                <td data-label="Руководитель">
                  <template v-if="row.leader">
                    {{ row.leader }} <span class="chip">{{ row.leaderRole }}</span>
                  </template>
                  <span v-else class="muted">не назначен</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <WorkerFormDialog
      :open="workerDialogOpen"
      :worker="null"
      :pii-editable="piiVisible"
      :busy="busy"
      :error="actionError"
      @close="workerDialogOpen = false"
      @save="saveWorker"
    />
    <WorkerProfileDialog :tabs="profileTabs">
      <template #tab="{ tab, worker }">
        <WorkerCertifications
          :worker-id="worker.id"
          :view="tab === 'testing' ? 'testing' : 'training'"
          :is-fired="worker.employment === 'fired'"
        />
      </template>
    </WorkerProfileDialog>
    <BrigadeProfileDialog v-model:brigade-id="openBrigadeId" />
  </section>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}

.page__header {
  display: flex;
  justify-content: space-between;
  gap: var(--space-4);
  align-items: flex-start;
  flex-wrap: wrap;
}

.page__header h1 {
  margin: 0;
  font-size: var(--page-title-size);
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: var(--line-height-tight);
  color: var(--text-primary);
}

.page__header p {
  margin: var(--space-2) 0 0;
  color: var(--text-secondary);
  max-width: 62ch;
  line-height: 1.45;
}

.page__actions {
  display: flex;
  gap: 8px;
}

.tabs {
  align-self: flex-start;
}

.tabs__btn {
  min-height: 36px;
}

.tabs__badge {
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: var(--status-warn-bg);
  border: 1px solid var(--status-warn-border);
  color: var(--status-warn-fg);
  font-size: var(--font-size-2xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.panel {
  min-width: 0;
  padding: var(--space-3);
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
}

.toolbar {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.search {
  position: relative;
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 0;
  color: var(--text-secondary);
}

.search__icon {
  position: absolute;
  left: 12px;
  pointer-events: none;
}

.search input {
  width: 100%;
  min-height: var(--control-height);
  padding: 0 44px 0 40px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-sunken);
  color: var(--text-primary);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.search input::-webkit-search-cancel-button {
  display: none;
}

.search input:focus {
  border-color: var(--accent);
  outline: none;
  background: var(--surface-card);
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.search__clear {
  position: absolute;
  right: 0;
  display: grid;
  place-items: center;
  width: var(--tap-size);
  height: var(--tap-size);
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .search input:hover:not(:focus) {
    border-color: var(--border-strong);
  }

  .search__clear:hover {
    color: var(--text-primary);
  }
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px var(--space-4);
  margin: var(--space-3) 0;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.legend__swatch {
  width: 14px;
  height: 10px;
  border-radius: var(--radius);
}

.legend__swatch--expiring {
  background: var(--status-warn-bg);
  border: 1px solid var(--status-warn-solid);
  border-left-width: 3px;
}

.legend__swatch--expired {
  background: var(--status-bad-bg);
  border: 1px solid var(--status-bad-solid);
  border-left-width: 3px;
}

.legend__count {
  margin-left: auto;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.table-wrap {
  overflow: auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}

table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

th,
td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
  font-size: var(--font-size-sm);
  vertical-align: middle;
}

td {
  height: 44px;
}

tbody tr:last-child td {
  border-bottom: 0;
}

th {
  padding: 0;
  background: var(--table-head-bg);
  position: sticky;
  top: 0;
  z-index: 2;
}

.num {
  text-align: right;
}

.sort {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  border: 0;
  background: transparent;
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.sort--active {
  color: var(--text-primary);
}

.sort--static {
  cursor: default;
}

.notice {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--status-warn-border);
  border-radius: var(--radius);
  background: var(--status-warn-bg);
  color: var(--status-warn-fg);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.notice ul {
  margin: 0;
  padding-left: var(--space-4);
}

.notice button {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.sort__arrow {
  font-size: var(--font-size-2xs);
  opacity: 0.45;
}

.sort--active .sort__arrow {
  color: var(--text-link);
  opacity: 1;
}

.nowrap {
  white-space: nowrap;
}

tbody tr {
  cursor: pointer;
}

tbody td {
  background-color: var(--surface-card);
}

tbody tr:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

tbody tr.row--archived td {
  color: var(--text-secondary);
}

tbody tr.row--expiring td {
  background-color: var(--status-warn-bg);
}

tbody tr.row--expired td {
  background-color: var(--status-bad-bg);
}

tbody tr.row--expiring td:first-child {
  box-shadow: inset 3px 0 0 var(--status-warn-solid);
}

tbody tr.row--expired td:first-child {
  box-shadow: inset 3px 0 0 var(--status-bad-solid);
}

@media (hover: hover) and (pointer: fine) {
  .sort:hover {
    color: var(--text-primary);
  }

  tbody tr:not(.row--expiring, .row--expired):hover td {
    background-color: var(--row-hover-bg);
  }

  tbody tr.row--expiring:hover td,
  tbody tr.row--expired:hover td {
    text-decoration: underline;
    text-decoration-color: var(--border-strong);
  }
}

.chip {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 6px;
  border-radius: var(--radius);
  background: var(--status-info-bg);
  color: var(--status-info-fg);
  font-size: var(--font-size-xs);
  font-weight: 600;
}

.muted {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

@media (max-width: 860px) {
  th:first-child,
  td:first-child {
    position: sticky;
    left: 0;
    z-index: 1;
  }

  th:first-child {
    z-index: 3;
  }

  td:first-child {
    box-shadow: 1px 0 0 var(--border-subtle);
  }

  .panel {
    padding: var(--space-2);
  }

  .table--workers .col--phone,
  .table--workers .col--training,
  .table--workers th.col--compliance {
    display: none;
  }

  .legend__count {
    margin-left: 0;
  }

  .table-wrap {
    border: 0;
    background: none;
    overflow: visible;
  }

  table,
  tbody,
  tr,
  td {
    display: block;
  }

  thead {
    display: block;
    margin-bottom: var(--space-2);
  }

  thead tr {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  th,
  th:first-child {
    position: static;
    flex: 0 0 auto;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius);
    background: var(--surface-card);
    font-size: var(--font-size-sm);
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
  }

  .sort {
    min-height: 36px;
    letter-spacing: 0.02em;
  }

  th[aria-sort='ascending'],
  th[aria-sort='descending'] {
    border-color: var(--accent);
    background: var(--accent-subtle);
  }

  tbody {
    display: grid;
    gap: var(--space-2);
  }

  tbody tr {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-1) var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius);
    background: var(--surface-card);
  }

  tbody tr.row--expiring {
    background: var(--status-warn-bg);
    box-shadow: inset 3px 0 0 var(--status-warn-solid);
  }

  tbody tr.row--expired {
    background: var(--status-bad-bg);
    box-shadow: inset 3px 0 0 var(--status-bad-solid);
  }

  td,
  td:first-child,
  tbody tr td,
  tbody tr.row--expiring td,
  tbody tr.row--expired td {
    position: static;
    height: auto;
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
    grid-column: 1 / -1;
    font-size: var(--font-size-sm);
  }

  td[data-label]:not(:first-child)::before {
    content: attr(data-label) ': ';
    color: var(--text-secondary);
    font-size: var(--font-size-xs);
  }

  td:first-child {
    grid-column: 1;
    font-size: var(--font-size-base);
  }

  .table--workers td:nth-child(5),
  .table--brigades td:nth-child(2) {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
  }

  .table--workers td:nth-child(5)::before,
  .table--brigades td:nth-child(2)::before,
  .table--workers td:nth-child(2)::before {
    content: none;
  }

  .table--workers td:nth-child(2) {
    color: var(--text-secondary);
  }

  .num {
    text-align: left;
  }
}
</style>