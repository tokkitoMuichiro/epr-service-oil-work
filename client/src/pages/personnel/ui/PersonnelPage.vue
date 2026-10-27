<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { BrigadeStatusBadge, useBrigadesStore } from '@/entities/brigade'
import { useContractsStore } from '@/entities/contract'
import {
  EMPLOYMENT_STATUS_LABEL,
  TRAINING_EXPIRING_DAYS,
  WorkerStatusBadge,
  usePersonnelStore,
  workerAttention,
  type WorkerDraft,
  type WorkerSortKey,
} from '@/entities/personnel'
import { useAccessStore, useRoleStore } from '@/entities/role'
import { TestingMarkIcon, testingMark, useTrainingStore, type TestingMark } from '@/entities/training'
import { WorkerFormDialog } from '@/features/worker-form'
import { shortFullName } from '@shared/person-name'
import { useScrollList } from '@/shared/lib/pagination'
import {
  IconArrowUp,
  IconClose,
  IconPersonnel,
  IconSearch,
  PageHeader,
  UiAvatar,
  UiButton,
  UiClipText,
  UiPagination,
  UiState,
} from '@/shared/ui'
import { BrigadeProfileDialog, NEW_BRIGADE } from '@/widgets/brigade-profile'
import { WorkerCertifications } from '@/widgets/worker-certifications'
import { WorkerProfileDialog } from '@/widgets/worker-profile'
import { useBrigadeList, type BrigadeSortKey } from '../model/use-brigade-list'
import { useWorkerList } from '../model/use-worker-list'
import MobileSort from './MobileSort.vue'
import WorkerFilters from './WorkerFilters.vue'

type TabId = 'workers' | 'brigades'

const personnel = usePersonnelStore()
const brigadesStore = useBrigadesStore()
const contracts = useContractsStore()
const roleStore = useRoleStore()

const { workers, status, errorText, actionError, notices, busy, isEmpty, today, profileId } = storeToRefs(personnel)
const { brigades, assignments, actionError: brigadeError } = storeToRefs(brigadesStore)
const { currentRole, piiVisible } = storeToRefs(roleStore)

const access = useAccessStore()
const training = useTrainingStore()
const showTraining = computed(() => access.canView('training'))
const profileTabs = computed(() => (showTraining.value ? [{ id: 'quals', label: 'Допуски' }] : []))
const testingByWorker = computed(
  () => new Map((training.summary?.rows ?? []).map((row) => [row.workerId, testingMark(row.statuses)])),
)

function testingOf(workerId: string): TestingMark {
  return testingByWorker.value.get(workerId) ?? 'none'
}

const list = useWorkerList(workers, brigadeName, testingOf)
const {
  query,
  employmentFilter,
  statusFilter,
  brigadeFilter,
  testingFilter,
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

const workerList = useScrollList(rows, {
  resetOn: [query, employmentFilter, statusFilter, brigadeFilter, testingFilter, sortKey, sortDirection],
})

const brigadeList = useBrigadeList(brigades, assignments, today, (id) => personnel.workerName(id))
const { sortKey: brigadeSortKey, sortDirection: brigadeSortDirection, rows: brigadeRows } = brigadeList
const brigadeWindow = useScrollList(brigadeRows, { resetOn: [brigadeSortKey, brigadeSortDirection] })

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
  <section class="page ui-fill-page">
    <PageHeader class="ui-fill-chrome" title="Персонал" description="Карточки сотрудников, документы и бригады.">
      <template v-if="(tab === 'workers' && canEdit) || (tab === 'brigades' && canPlan)" #actions>
        <UiButton v-if="tab === 'workers'" variant="primary" class="header-add" @click="openCreateWorker">
          <span class="header-add__full">Добавить сотрудника</span>
          <span class="header-add__short">Добавить</span>
        </UiButton>
        <UiButton v-else variant="primary" class="header-add" @click="openCreateBrigade">
          <span class="header-add__full">Новая бригада</span>
          <span class="header-add__short">Добавить</span>
        </UiButton>
      </template>
      <template #tabs>
        <div class="ui-segmented" role="tablist" aria-label="Разделы персонала">
          <button type="button" role="tab" :aria-selected="tab === 'workers'" @click="tab = 'workers'">
            Сотрудники <span class="ui-segmented__count">{{ workers.length }}</span>
          </button>
          <button type="button" role="tab" :aria-selected="tab === 'brigades'" @click="tab = 'brigades'">
            Бригады <span class="ui-segmented__count">{{ brigades.length }}</span>
          </button>
        </div>
      </template>
    </PageHeader>

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
      <UiState v-if="isEmpty" title="Сотрудников пока нет" :icon="IconPersonnel" text="Добавьте первую карточку сотрудника.">
        <UiButton v-if="canEdit" variant="primary" @click="openCreateWorker">Добавить</UiButton>
      </UiState>

      <div v-else class="panel ui-fill-panel">
        <div class="toolbar ui-fill-chrome">
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
            v-model:testing="testingFilter"
            :show-testing="showTraining"
            :brigades="brigades"
            :active-count="activeFilterCount"
            @reset="list.resetFilters"
          />
        </div>

        <div class="legend ui-fill-chrome">
          <span>
            <i class="legend__swatch legend__swatch--expiring" />Документ истекает<span class="ui-hide-mobile">&nbsp;в течение {{ TRAINING_EXPIRING_DAYS }} дней</span>
          </span>
          <span><i class="legend__swatch legend__swatch--expired" />Документ просрочен</span>
          <span class="legend__count">Показано: {{ workerList.pageItems.length }} из {{ rows.length }}</span>
          <MobileSort v-model:sort-key="sortKey" v-model:direction="sortDirection" class="legend__sort" :options="COLUMNS" />
        </div>

        <UiState v-if="!rows.length" title="Ничего не найдено" :icon="IconSearch" text="Измените поиск или фильтры." />

        <div v-else :ref="workerList.bindList" class="ui-fill-scroll" @scroll.passive="workerList.onListScroll">
          <div class="ui-rows workers-rows" :class="{ 'workers-rows--testing': showTraining }">
            <div class="ui-rows__head">
              <span
                v-for="column in COLUMNS"
                :key="column.key"
                class="ui-rows__cell"
                :class="[`cell--${column.key}`, { 'ui-rows__cell--name': column.key === 'fullName' }]"
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
              </span>
              <span v-if="showTraining" class="ui-rows__cell cell--testing">Проверка</span>
            </div>
            <ul class="ui-rows__list" aria-label="Сотрудники">
              <li
                v-for="w in workerList.pageItems"
                :key="w.id"
                class="ui-rows__item ui-rows__item--click"
                :class="workerAttention(w, today) ? `row--${workerAttention(w, today)}` : ''"
                tabindex="0"
                @click="personnel.openProfile(w.id)"
                @keydown.enter.prevent="personnel.openProfile(w.id)"
              >
                <span class="ui-rows__cell ui-rows__cell--name cell--fullName">
                  <UiAvatar :name="w.fullName" />
                  <UiClipText tag="strong" :text="shortFullName(w.fullName)" />
                </span>
                <span class="ui-rows__cell cell--position">
                  <UiClipText :text="w.position" />
                </span>
                <span class="ui-rows__cell cell--brigade">
                  <UiClipText :text="brigadeName(w.brigadeId)" />
                </span>
                <span class="ui-rows__cell cell--phone">
                  <UiClipText :text="w.phone || '—'" />
                </span>
                <span class="ui-rows__cell cell--status">
                  <WorkerStatusBadge :compact="workerList.isMobile" :status="w.status" />
                </span>
                <span class="ui-rows__cell cell--employment">
                  <UiClipText :text="EMPLOYMENT_STATUS_LABEL[w.employment]" />
                </span>
                <span v-if="showTraining" class="ui-rows__cell cell--testing">
                  <TestingMarkIcon :mark="testingOf(w.id)" />
                </span>
              </li>
            </ul>
          </div>
          <div v-if="workerList.infinite.hasMore" :ref="workerList.bindSentinel" class="ui-rows__sentinel" aria-hidden="true" />
        </div>
        <UiPagination
          v-if="!workerList.isMobile && workerList.pager.isPaged"
          v-model:page="workerList.pager.page"
          class="pager ui-fill-chrome"
          :total="workerList.pager.total"
          :page-size="workerList.pager.pageSize"
          label="Страницы списка сотрудников"
        />
        <button
          v-if="workerList.isMobile && workerList.showScrollTop"
          type="button"
          class="ui-scroll-top"
          aria-label="Наверх"
          @click="workerList.scrollToTop"
        >
          <IconArrowUp :size="20" />
        </button>
      </div>
    </template>

    <template v-else>
      <UiState
        v-if="!brigades.length"
        title="Бригад пока нет"
        :icon="IconPersonnel"
        text="Соберите бригаду из сотрудников и назначьте бригадира."
      >
        <UiButton v-if="canPlan" variant="primary" @click="openCreateBrigade">Новая бригада</UiButton>
      </UiState>

      <div v-else class="panel ui-fill-panel">
        <div class="legend legend--brigades ui-fill-chrome">
          <span class="legend__count">Бригад: {{ brigadeRows.length }}</span>
          <MobileSort
            v-model:sort-key="brigadeSortKey"
            v-model:direction="brigadeSortDirection"
            class="legend__sort"
            :options="BRIGADE_COLUMNS"
          />
        </div>
        <div :ref="brigadeWindow.bindList" class="ui-fill-scroll" @scroll.passive="brigadeWindow.onListScroll">
          <div class="ui-rows brigades-rows">
            <div class="ui-rows__head">
              <span
                v-for="column in BRIGADE_COLUMNS"
                :key="column.key"
                class="ui-rows__cell"
                :class="[`cell--${column.key}`, { 'ui-rows__cell--name': column.key === 'name' }]"
                :aria-sort="brigadeAriaSort(column.key)"
              >
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
              </span>
            </div>
            <ul class="ui-rows__list" aria-label="Бригады">
              <li
                v-for="row in brigadeWindow.pageItems"
                :key="row.brigade.id"
                class="ui-rows__item ui-rows__item--click"
                :class="{ 'row--archived': row.brigade.archived }"
                tabindex="0"
                @click="openBrigadeId = row.brigade.id"
                @keydown.enter.prevent="openBrigadeId = row.brigade.id"
              >
                <span class="ui-rows__cell ui-rows__cell--name cell--name">
                  <UiClipText tag="strong" :text="row.brigade.name" />
                </span>
                <span class="ui-rows__cell cell--status">
                  <span v-if="row.brigade.archived" class="ui-badge ui-badge--neutral">Архив</span>
                  <BrigadeStatusBadge v-else :status="row.status" />
                </span>
                <span class="ui-rows__cell cell--size">{{ row.size }}</span>
                <span class="ui-rows__cell cell--leader">
                  <template v-if="row.leader">
                    <UiClipText :text="row.leader.split(', ').map(shortFullName).join(', ')" />
                    <span class="chip">{{ row.leaderRole }}</span>
                  </template>
                  <span v-else class="muted">не назначен</span>
                </span>
              </li>
            </ul>
          </div>
          <div v-if="brigadeWindow.infinite.hasMore" :ref="brigadeWindow.bindSentinel" class="ui-rows__sentinel" aria-hidden="true" />
        </div>
        <UiPagination
          v-if="!brigadeWindow.isMobile && brigadeWindow.pager.isPaged"
          v-model:page="brigadeWindow.pager.page"
          class="pager ui-fill-chrome"
          :total="brigadeWindow.pager.total"
          :page-size="brigadeWindow.pager.pageSize"
          label="Страницы списка бригад"
        />
        <button
          v-if="brigadeWindow.isMobile && brigadeWindow.showScrollTop"
          type="button"
          class="ui-scroll-top"
          aria-label="Наверх"
          @click="brigadeWindow.scrollToTop"
        >
          <IconArrowUp :size="20" />
        </button>
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
      <template #tab="{ worker }">
        <WorkerCertifications :worker-id="worker.id" :is-fired="worker.employment === 'fired'" />
      </template>
    </WorkerProfileDialog>
    <BrigadeProfileDialog v-model:brigade-id="openBrigadeId" />
  </section>
</template>

<style scoped>
.page {
  gap: var(--space-4);
}

.page :deep(.page-header) {
  flex: 0 0 auto;
}

.header-add__short {
  display: none;
}

.workers-rows {
  --ui-rows-columns: minmax(6rem, 1.4fr) minmax(4.5rem, 1fr) minmax(4.5rem, 1fr) minmax(5.5rem, 8rem) minmax(5rem, 8rem)
    minmax(5rem, 7rem);
}

.workers-rows--testing {
  --ui-rows-columns: minmax(6rem, 1.4fr) minmax(4.5rem, 1fr) minmax(4.5rem, 1fr) minmax(5.5rem, 8rem) minmax(5rem, 8rem)
    minmax(5rem, 7rem) minmax(3.5rem, 5rem);
}

.brigades-rows {
  --ui-rows-columns: minmax(6rem, 1.6fr) minmax(5rem, 8rem) minmax(4rem, 6rem) minmax(5rem, 1.1fr);
}

.cell--phone,
.cell--employment {
  min-width: 5rem;
  max-width: 8rem;
}

.cell--testing {
  justify-content: center;
  min-width: 3.5rem;
  max-width: 5rem;
}

.cell--size {
  min-width: 4rem;
  max-width: 6rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
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
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.legend__swatch {
  width: 4px;
  height: 14px;
}

.legend__swatch--expiring {
  background: var(--status-warn-solid);
}

.legend__swatch--expired {
  background: var(--status-bad-solid);
}

.legend__count {
  margin-left: auto;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.legend--brigades {
  display: none;
}

.sort {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: var(--control-height-sm);
  padding: 0;
  border: 0;
  background: transparent;
  overflow: hidden;
  font-size: var(--font-size-xs);
  font-weight: 600;
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

.row--archived {
  color: var(--text-secondary);
}

.row--expiring {
  box-shadow: inset 3px 0 0 var(--status-warn-solid);
}

.row--expired {
  box-shadow: inset 3px 0 0 var(--status-bad-solid);
}

@media (hover: hover) and (pointer: fine) {
  .sort:hover {
    color: var(--text-primary);
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
  .page {
    gap: var(--space-3);
  }

  .page :deep(.page-header) {
    flex-wrap: nowrap;
    align-items: stretch;
  }

  .page :deep(.page-header__tabs),
  .page :deep(.page-header__actions) {
    display: flex;
    align-items: stretch;
    height: var(--control-height);
  }

  .page :deep(.ui-segmented) {
    width: 100%;
    height: var(--control-height);
    padding: 0;
    gap: 0;
  }

  .page :deep(.ui-segmented > button) {
    flex: 1;
    min-height: 0;
    height: 100%;
    padding: 0 var(--space-2);
  }

  .page :deep(.page-header__actions .btn) {
    height: var(--control-height);
    min-height: var(--control-height);
    padding: 0 var(--space-3);
  }

  .header-add__full {
    display: none;
  }

  .header-add__short {
    display: inline;
  }

  .panel {
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
  }

  .legend {
    align-items: center;
    gap: var(--space-1) var(--space-3);
    margin: var(--space-2) 0 var(--space-1);
  }

  .legend--brigades {
    display: flex;
    margin-top: 0;
  }

  .legend__sort {
    margin-left: auto;
  }

  .pager {
    margin-top: var(--space-2);
  }

  .legend__count {
    margin-left: 0;
  }

  .workers-rows,
  .workers-rows--testing {
    --ui-rows-columns: minmax(4.5rem, 1.3fr) minmax(3.5rem, 1fr) minmax(3.5rem, 1fr) 1.5rem;
  }

  .brigades-rows {
    --ui-rows-columns: minmax(4.5rem, 1.5fr) minmax(4.5rem, 7rem) minmax(3.25rem, 5rem) minmax(4.5rem, 1fr);
  }

  .cell--phone,
  .cell--employment,
  .cell--testing {
    display: none;
  }

  .workers-rows .cell--status {
    min-width: 1.5rem;
    max-width: 1.5rem;
    justify-content: center;
  }
}
</style>