<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useEquipmentRouteName } from '@/shared/lib/equipment-routes'
import { canManageWarehouses, pendingTransfer, positionsLabel, useEquipmentStore, type Warehouse } from '@/entities/equipment'
import { WarehouseFormDialog } from '@/features/warehouse-form'
import { shortFullName } from '@shared/person-name'
import { useIsMobile } from '@/shared/lib/media'
import { useFitPagination, useInfiniteWindow } from '@/shared/lib/pagination'
import { compareLocale, compareNumber, useColumnSort } from '@/shared/lib/sort'
import {
  IconArrowUp,
  IconClose,
  IconEquipment,
  IconPencil,
  IconTrash,
  UiButton,
  UiClipText,
  UiMobileSort,
  UiPagination,
  UiState,
  askConfirm,
} from '@/shared/ui'
import EquipmentExportMenu from './EquipmentExportMenu.vue'

const store = useEquipmentStore()
const router = useRouter()
const { nameOf } = useEquipmentRouteName()
const isMobile = useIsMobile()

const isFormOpen = ref(false)
const editing = ref<Warehouse | null>(null)
const listRef = ref<HTMLElement | null>(null)
const sentinelEl = ref<HTMLElement | null>(null)
const showScrollTop = ref(false)
const canManage = computed(() => canManageWarehouses(store.auth))

type WarehouseSortKey = 'name' | 'address' | 'keepers' | 'total'

const SORT_COLUMNS: { key: WarehouseSortKey; label: string }[] = [
  { key: 'name', label: 'Название' },
  { key: 'address', label: 'Адрес' },
  { key: 'keepers', label: 'Кладовщики' },
  { key: 'total', label: 'Всего' },
]

const { sortKey, sortDirection, toggleSort, ariaSort, arrow } = useColumnSort<WarehouseSortKey>('name')

const bases = computed(() => {
  const list = [...store.warehouses]
  return list.sort((a, b) => {
    const system = Number(b.isSystem) - Number(a.isSystem)
    if (system) return system
    if (sortKey.value === 'total') {
      return (
        compareNumber(store.itemsOnWarehouse(a.id).length, store.itemsOnWarehouse(b.id).length, sortDirection.value) ||
        compareLocale(a.name, b.name, 'asc')
      )
    }
    if (sortKey.value === 'address') return compareLocale(a.address || '', b.address || '', sortDirection.value) || compareLocale(a.name, b.name, 'asc')
    if (sortKey.value === 'keepers') return compareLocale(keepersOf(a), keepersOf(b), sortDirection.value) || compareLocale(a.name, b.name, 'asc')
    return compareLocale(a.name, b.name, sortDirection.value)
  })
})

const resetOn = [bases, sortKey, sortDirection]
const pager = useFitPagination(bases, { resetOn })
const infinite = useInfiniteWindow(bases, { enabled: isMobile, resetOn })
const pageItems = computed(() => (isMobile.value ? infinite.pageItems : pager.pageItems))

let observer: IntersectionObserver | null = null

function bindList(el: unknown) {
  const node = el instanceof HTMLElement ? el : null
  listRef.value = node
  pager.bindFit(isMobile.value ? null : node)
}

function bindSentinel(el: unknown) {
  sentinelEl.value = el instanceof HTMLElement ? el : null
}

function observeSentinel() {
  observer?.disconnect()
  observer = null
  const root = listRef.value
  const target = sentinelEl.value
  if (!root || !target || !infinite.hasMore) return
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) infinite.loadMore()
    },
    { root, rootMargin: '160px' },
  )
  observer.observe(target)
}

function onListScroll() {
  const el = listRef.value
  showScrollTop.value = Boolean(isMobile.value && el && el.scrollTop > 240)
}

function scrollToTop() {
  listRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

watch([listRef, sentinelEl, () => infinite.hasMore, isMobile], observeSentinel, { flush: 'post' })

watch(isMobile, () => {
  pager.bindFit(isMobile.value ? null : listRef.value)
  showScrollTop.value = false
})

onBeforeUnmount(() => observer?.disconnect())

function incomingTo(id: string) {
  return store.items.filter((i) => {
    const pending = pendingTransfer(i, store.transfers)
    return pending?.status === 'PENDING' && pending.toWarehouseId === id
  }).length
}

function keepersOf(w: Warehouse) {
  const names = w.keeperIds.map((id) => shortFullName(store.personName(id))).filter((n) => n && n !== '—')
  return names.join(', ') || 'не назначены'
}

function isMine(w: Warehouse) {
  return store.persona.warehouseIds.includes(w.id)
}

function rowState(w: Warehouse) {
  if (incomingTo(w.id)) return 'pending'
  if (w.isSystem) return 'system'
  return ''
}

function itemTip(w: Warehouse) {
  const parts = [w.name]
  if (w.address) parts.push(w.address)
  parts.push(`Кладовщики: ${keepersOf(w)}`)
  const incoming = incomingTo(w.id)
  if (incoming) parts.push(`Входящих: ${incoming}`)
  return parts.join(' · ')
}

function openBase(w: Warehouse) {
  void router.push({ name: nameOf('equipment-warehouse'), params: { id: w.id } })
}

function openForm(w: Warehouse | null) {
  editing.value = w
  isFormOpen.value = true
}

async function remove(w: Warehouse) {
  if (!(await askConfirm({ title: `Удалить базу «${w.name}»?`, confirmText: 'Удалить базу' }))) return
  await store.removeWarehouse(w.id)
}
</script>

<template>
  <div class="page ui-fill-page">
    <div class="page__bar ui-fill-chrome">
      <p class="muted intro ui-hide-mobile">
        Кладовщик принимает передачи на свою базу и передаёт с неё оборудование. База «Ремонт» — системная: сюда
        попадает всё со статусом «В ремонте».
      </p>
      <div class="page__actions">
        <UiMobileSort v-model:sort-key="sortKey" v-model:direction="sortDirection" :options="SORT_COLUMNS" />
        <UiButton v-if="canManage" variant="primary" @click="openForm(null)">
          <span class="ui-hide-mobile">Новая база</span>
          <span class="page__add-short">Добавить</span>
        </UiButton>
        <EquipmentExportMenu />
      </div>
    </div>

    <p v-if="store.actionError && !isFormOpen" class="alert ui-fill-chrome" role="alert">
      {{ store.actionError }}
      <button type="button" aria-label="Скрыть" @click="store.clearActionError()"><IconClose :size="16" /></button>
    </p>

    <UiState v-if="!bases.length" title="Баз пока нет" :icon="IconEquipment" text="Создайте первую производственную базу." />

    <div v-else class="panel ui-fill-panel">
      <div :ref="bindList" class="list ui-fill-scroll" @scroll.passive="onListScroll">
        <div class="rows" :class="{ 'rows--manage': canManage }">
          <div class="rows__head">
            <span class="cell cell--name" :aria-sort="ariaSort('name')">
              <button type="button" class="ui-sort" :class="{ 'ui-sort--active': sortKey === 'name' }" @click="toggleSort('name')">
                Название<span class="ui-sort__arrow" aria-hidden="true">{{ arrow('name') }}</span>
              </button>
            </span>
            <span class="cell cell--address" :aria-sort="ariaSort('address')">
              <button type="button" class="ui-sort" :class="{ 'ui-sort--active': sortKey === 'address' }" @click="toggleSort('address')">
                Адрес<span class="ui-sort__arrow" aria-hidden="true">{{ arrow('address') }}</span>
              </button>
            </span>
            <span class="cell cell--keepers" :aria-sort="ariaSort('keepers')">
              <button type="button" class="ui-sort" :class="{ 'ui-sort--active': sortKey === 'keepers' }" @click="toggleSort('keepers')">
                Кладовщики<span class="ui-sort__arrow" aria-hidden="true">{{ arrow('keepers') }}</span>
              </button>
            </span>
            <span class="cell cell--total" :aria-sort="ariaSort('total')">
              <button type="button" class="ui-sort" :class="{ 'ui-sort--active': sortKey === 'total' }" @click="toggleSort('total')">
                Всего<span class="ui-sort__arrow" aria-hidden="true">{{ arrow('total') }}</span>
              </button>
            </span>
            <span v-if="canManage" class="cell cell--actions" />
          </div>
          <ul class="rows__list" aria-label="Производственные базы">
            <li
              v-for="w in pageItems"
              :key="w.id"
              class="rows__item"
              tabindex="0"
              :data-state="rowState(w)"
              :title="itemTip(w)"
              @click="openBase(w)"
              @keydown.enter.prevent="openBase(w)"
              @keydown.space.prevent="openBase(w)"
            >
              <span class="cell cell--name">
                <UiClipText tag="strong" class="name" :text="w.name" />
                <span v-if="w.isSystem" class="tag ui-badge ui-badge--info">Системная</span>
                <span v-if="isMine(w)" class="tag ui-badge ui-badge--ok">Ваша база</span>
                <span v-if="incomingTo(w.id)" class="tag ui-badge ui-badge--warn">Входящих: {{ incomingTo(w.id) }}</span>
              </span>
              <span class="cell cell--address">
                <UiClipText :text="w.address || '—'" />
              </span>
              <span class="cell cell--keepers">
                <UiClipText :text="keepersOf(w)" />
              </span>
              <span class="cell cell--total">
                <UiClipText class="mono" :text="positionsLabel(store.itemsOnWarehouse(w.id).length)" />
              </span>
              <span v-if="canManage" class="cell cell--actions" @click.stop>
                <button type="button" class="link action-text" @click="openForm(w)">Изменить</button>
                <button v-if="!w.isSystem" type="button" class="link action-text" :disabled="store.busy" @click="remove(w)">
                  Удалить
                </button>
                <UiButton class="action-icon" size="icon" variant="ghost" aria-label="Изменить" @click="openForm(w)">
                  <IconPencil :size="16" />
                </UiButton>
                <UiButton
                  v-if="!w.isSystem"
                  class="action-icon"
                  size="icon"
                  variant="ghost"
                  aria-label="Удалить"
                  :disabled="store.busy"
                  @click="remove(w)"
                >
                  <IconTrash :size="16" />
                </UiButton>
              </span>
            </li>
          </ul>
        </div>
        <div v-if="infinite.hasMore" :ref="bindSentinel" class="list__sentinel" aria-hidden="true" />
      </div>
      <UiPagination
        v-if="!isMobile && pager.isPaged"
        v-model:page="pager.page"
        class="ui-fill-chrome"
        :total="pager.total"
        :page-size="pager.pageSize"
      />
      <button
        v-if="isMobile && showScrollTop"
        type="button"
        class="scroll-top"
        aria-label="Наверх"
        @click="scrollToTop"
      >
        <IconArrowUp :size="20" />
      </button>
    </div>

    <WarehouseFormDialog :open="isFormOpen" :warehouse="editing" @close="isFormOpen = false" />
  </div>
</template>

<style scoped src="./panel.css"></style>

<style scoped>
.intro {
  margin: 0;
  max-width: 70ch;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
}

.panel {
  gap: var(--space-3);
}

.list {
  flex: 1 1 auto;
  min-width: 0;
  min-height: calc(var(--control-height) * 6);
  max-width: 100%;
  overflow-x: clip;
}

.rows {
  --name-col: minmax(6rem, 2.2fr);
  --address-col: minmax(4.5rem, 1.2fr);
  --keepers-col: minmax(4.5rem, 1.1fr);
  --total-col: minmax(4.5rem, 7rem);
  --actions-col: 9rem;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  overflow: hidden;
}

.rows__head,
.rows__item {
  display: grid;
  grid-template-columns: var(--name-col) var(--address-col) var(--keepers-col) var(--total-col);
  align-items: center;
  gap: var(--space-2);
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: var(--control-height-sm);
  max-height: var(--control-height-sm);
  padding: 0 var(--space-3);
  overflow: hidden;
}

.rows--manage .rows__head,
.rows--manage .rows__item {
  grid-template-columns: var(--name-col) var(--address-col) var(--keepers-col) var(--total-col) var(--actions-col);
}

.rows__head {
  position: sticky;
  top: 0;
  z-index: 1;
  min-height: var(--control-height-sm);
  max-height: var(--control-height-sm);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--table-head-bg);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  font-weight: 700;
}

.rows__list {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rows__item {
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-card);
  cursor: pointer;
}

.rows__list .rows__item:first-child {
  border-top: 0;
}

.rows__item[data-state='pending'] {
  box-shadow: inset 3px 0 0 var(--status-warn-solid);
}

.rows__item[data-state='system'] {
  box-shadow: inset 3px 0 0 var(--accent);
}

.cell {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-width: 4rem;
  max-width: 100%;
  max-height: 100%;
  overflow: hidden;
}

.cell--name {
  min-width: 6rem;
}

.cell--address {
  min-width: 4.5rem;
  max-width: 14rem;
}

.cell--keepers {
  min-width: 4.5rem;
  max-width: 12rem;
}

.cell--total {
  min-width: 4.5rem;
  max-width: 7rem;
}

.cell--actions {
  justify-content: flex-end;
  min-width: 5.5rem;
  max-width: var(--actions-col);
}

.rows__head .cell {
  white-space: nowrap;
}

.name {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 600;
}

.tag {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 6.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mono {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--text-link);
}

.link {
  max-width: 100%;
  min-height: var(--control-height-sm);
  padding: 0 var(--space-2);
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-link);
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.link:disabled {
  color: var(--text-disabled);
  cursor: not-allowed;
}

.action-icon {
  display: none;
}

.list__sentinel {
  height: 1px;
}

.scroll-top {
  position: fixed;
  right: calc(var(--space-4) + var(--safe-right));
  bottom: calc(var(--space-4) + var(--safe-bottom));
  z-index: var(--z-header);
  display: grid;
  place-items: center;
  width: var(--tap-size);
  height: var(--tap-size);
  padding: 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-raised);
  color: var(--text-primary);
  box-shadow: var(--shadow-raised);
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .rows__item:hover {
    z-index: 2;
    outline: 1px solid var(--border-strong);
    outline-offset: -1px;
    background: var(--row-hover-bg);
  }

  .link:not(:disabled):hover {
    background: var(--accent-subtle);
  }

  .scroll-top:hover {
    border-color: var(--border-strong);
  }
}

@media (max-width: 860px) {
  .rows {
    --name-col: minmax(4.5rem, 1.6fr);
    --address-col: minmax(3.25rem, 0.9fr);
    --keepers-col: minmax(3.25rem, 0.9fr);
    --total-col: minmax(3.5rem, 5.25rem);
    --actions-col: 6.5rem;
    border: 0;
    background: none;
    overflow: visible;
  }

  .rows__head {
    display: none;
  }

  .rows__item {
    gap: var(--space-1);
    margin-bottom: var(--space-1);
    min-height: var(--control-height);
    max-height: var(--control-height);
    padding: 0 var(--space-2);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius);
  }

  .rows__list .rows__item:first-child {
    border-top: 1px solid var(--border-subtle);
  }

  .cell {
    min-width: 3.25rem;
  }

  .cell--name {
    min-width: 4.5rem;
  }

  .cell--address,
  .cell--keepers {
    min-width: 3.25rem;
    max-width: 7rem;
  }

  .cell--total {
    min-width: 3.5rem;
    max-width: 5.25rem;
  }

  .action-text {
    display: none;
  }

  .action-icon {
    display: inline-grid;
  }

  .cell--actions :deep(.btn) {
    min-height: var(--tap-size);
  }

  .tag {
    display: none;
  }
}

@media (max-width: 560px) {
  .rows {
    --actions-col: 6.25rem;
  }
}
</style>
