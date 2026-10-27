<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  CARD_KIND_OPTIONS,
  CONDITION_LABEL,
  CONDITION_OPTIONS,
  ConditionBadge,
  VEHICLE_KIND_OPTIONS,
  canAcceptTransfer,
  canCancelPendingTransfer,
  canTransferItem,
  identityLabel,
  isPendingAccept,
  matchesEquipmentQuery,
  pendingOfferLabel,
  positionsLabel,
  repairOrigin,
  sortEquipment,
  useEquipmentStore,
  type AssetCategory,
  type EquipmentItem,
} from '@/entities/equipment'
import { EquipmentFormDialog } from '@/features/equipment-form'
import { FillRemarkDialog } from '@/features/equipment-fill-review'
import { TransferDialog } from '@/features/equipment-transfer'
import { shortFullName } from '@shared/person-name'
import { useIsMobile } from '@/shared/lib/media'
import { useFitPagination, useInfiniteWindow } from '@/shared/lib/pagination'
import { IconArrowUp, IconClose, UiButton, UiClipText, UiPagination, UiState } from '@/shared/ui'
import EquipmentCardDialog from './EquipmentCardDialog.vue'

const props = withDefaults(
  defineProps<{
    items: EquipmentItem[]
    category: AssetCategory
    emptyTitle?: string
    emptyText?: string
    showOwner?: boolean
    showRepairSender?: boolean
  }>(),
  {
    emptyTitle: 'Здесь пока пусто',
    emptyText: 'Позиции появятся после создания или передачи.',
    showOwner: true,
    showRepairSender: false,
  },
)

const store = useEquipmentStore()
const isMobile = useIsMobile()

const query = ref('')
const kindFilter = ref('')
const selectedIds = ref<string[]>([])
const detailId = ref<string | null>(null)
const transferItems = ref<EquipmentItem[]>([])
const isTransferOpen = ref(false)
const editItem = ref<EquipmentItem | null>(null)
const remarkItem = ref<EquipmentItem | null>(null)
const listRef = ref<HTMLElement | null>(null)
const sentinelEl = ref<HTMLElement | null>(null)
const showScrollTop = ref(false)

const auth = computed(() => store.auth)
const transfers = computed(() => store.transfers)
const isCard = computed(() => props.category === 'CARD')

const kindOptions = computed(() => {
  if (props.category === 'VEHICLE') return VEHICLE_KIND_OPTIONS
  if (props.category === 'CARD') return CARD_KIND_OPTIONS
  return CONDITION_OPTIONS
})

const kindPlaceholder = computed(() => {
  if (props.category === 'VEHICLE') return 'Все виды ТС'
  if (props.category === 'CARD') return 'Все типы карт'
  return 'Все состояния'
})

const searchPlaceholder = computed(() => {
  if (props.category === 'VEHICLE') return 'Поиск: марка, госномер'
  if (props.category === 'CARD') return 'Поиск: название, номер'
  return 'Поиск: название, заводской номер'
})

const inCategory = computed(() => props.items.filter((i) => i.category === props.category))

const visible = computed(() =>
  sortEquipment(
    inCategory.value.filter((item) => {
      if (!matchesEquipmentQuery(item, query.value)) return false
      if (!kindFilter.value) return true
      if (props.category === 'VEHICLE') return item.vehicleKind === kindFilter.value
      if (props.category === 'CARD') return item.cardKind === kindFilter.value
      return item.condition === kindFilter.value
    }),
  ),
)

const resetOn = [query, kindFilter, () => props.category, () => props.items]
const pager = useFitPagination(visible, { resetOn })
const infinite = useInfiniteWindow(visible, { enabled: isMobile, resetOn })
const pageItems = computed(() => (isMobile.value ? infinite.pageItems : pager.pageItems))

const selectable = computed(() => visible.value.filter((i) => canTransferItem(auth.value, i, transfers.value)))
const selectedItems = computed(() => store.items.filter((i) => selectedIds.value.includes(i.id)))
const isAllSelected = computed(
  () => selectable.value.length > 0 && selectable.value.every((i) => selectedIds.value.includes(i.id)),
)
const isAnyDialogOpen = computed(
  () => Boolean(detailId.value || isTransferOpen.value || editItem.value || remarkItem.value),
)

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

watch([query, kindFilter, () => props.category, () => props.items], () => {
  if (listRef.value) listRef.value.scrollTop = 0
  showScrollTop.value = false
})

onBeforeUnmount(() => observer?.disconnect())

watch(
  () => [props.category, props.items] as const,
  () => {
    const allowed = new Set(selectable.value.map((i) => i.id))
    selectedIds.value = selectedIds.value.filter((id) => allowed.has(id))
  },
)

watch(
  () => props.category,
  () => {
    kindFilter.value = ''
  },
)

function isSelected(item: EquipmentItem) {
  return selectedIds.value.includes(item.id)
}

function toggle(item: EquipmentItem) {
  selectedIds.value = isSelected(item)
    ? selectedIds.value.filter((id) => id !== item.id)
    : [...selectedIds.value, item.id]
}

function toggleAll() {
  selectedIds.value = isAllSelected.value ? [] : selectable.value.map((i) => i.id)
}

function rowState(item: EquipmentItem) {
  if (item.fillStatus === 'NEEDS_FIX') return 'fix'
  if (item.fillStatus === 'PENDING_REVIEW') return 'review'
  if (isPendingAccept(item, transfers.value)) return 'pending'
  return ''
}

function openTransfer(items: EquipmentItem[]) {
  transferItems.value = items
  isTransferOpen.value = true
}

function onTransferred() {
  selectedIds.value = []
}

function origin(item: EquipmentItem) {
  return repairOrigin(item, transfers.value)
}

function ownerText(item: EquipmentItem) {
  const label = store.labelForOwner(item)
  return item.ownerType === 'USER' ? shortFullName(label) : label
}

function ownerTip(item: EquipmentItem) {
  const label = store.labelForOwner(item)
  const sent = props.showRepairSender ? origin(item) : null
  return sent ? `${label} · отправил: ${sent.by} (${sent.from})` : label
}

function idText(item: EquipmentItem) {
  return item.type === 'CONSUMABLE' ? `${item.quantity} шт.` : identityLabel(item)
}
</script>

<template>
  <div class="board ui-fill-panel">
    <div class="board__chrome ui-fill-chrome">
      <slot name="sticky" />
      <div class="toolbar">
        <input v-model="query" class="toolbar__search ui-control" type="search" :placeholder="searchPlaceholder" aria-label="Поиск" />
        <select v-model="kindFilter" class="toolbar__select ui-control" :aria-label="kindPlaceholder">
          <option value="">{{ kindPlaceholder }}</option>
          <option v-for="opt in kindOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <span class="toolbar__count">{{ positionsLabel(visible.length) }}</span>
      </div>
    </div>

    <p v-if="store.actionError && !isAnyDialogOpen" class="alert" role="alert">
      {{ store.actionError }}
      <button type="button" aria-label="Скрыть" @click="store.clearActionError()"><IconClose :size="16" /></button>
    </p>

    <div v-if="selectedIds.length" class="selection" role="region" aria-label="Выбранные позиции">
      <span>Выбрано: <strong>{{ positionsLabel(selectedIds.length) }}</strong></span>
      <div class="selection__actions">
        <UiButton size="sm" variant="primary" @click="openTransfer(selectedItems)">Передать выбранные</UiButton>
        <UiButton size="sm" variant="ghost" @click="selectedIds = []">Снять выбор</UiButton>
      </div>
    </div>

    <UiState
      v-if="!visible.length"
      :title="inCategory.length ? 'Ничего не найдено' : emptyTitle"
      :text="inCategory.length ? 'Измените поиск или фильтр.' : emptyText"
    />

    <template v-else>
      <div :ref="bindList" class="list ui-fill-scroll" @scroll.passive="onListScroll">
        <div class="rows" :class="{ 'rows--plain': !selectable.length, 'rows--no-owner': !showOwner }">
          <div class="rows__head">
            <span class="cell cell--check">
              <input
                v-if="selectable.length"
                type="checkbox"
                :checked="isAllSelected"
                aria-label="Выбрать все доступные для передачи"
                @change="toggleAll"
              />
            </span>
            <span class="cell cell--name">Наименование</span>
            <span class="cell cell--id">№ / кол-во</span>
            <span class="cell cell--condition">Состояние</span>
            <span v-if="showOwner" class="cell cell--owner">Владелец</span>
            <span class="cell cell--actions" />
          </div>
          <ul class="rows__list">
            <li
              v-for="item in pageItems"
              :key="item.id"
              class="rows__item"
              :class="{ 'rows__item--selected': isSelected(item) }"
              :data-state="rowState(item)"
              @click="detailId = item.id"
            >
              <span class="cell cell--check" @click.stop>
                <input
                  v-if="canTransferItem(auth, item, transfers)"
                  type="checkbox"
                  :checked="isSelected(item)"
                  :aria-label="`Выбрать ${item.name}`"
                  @change="toggle(item)"
                />
              </span>
              <span class="cell cell--name">
                <UiClipText tag="strong" class="name" :text="item.name" />
                <UiClipText
                  v-if="pendingOfferLabel(item, transfers)"
                  class="pending"
                  :text="pendingOfferLabel(item, transfers)"
                />
              </span>
              <span class="cell cell--id">
                <UiClipText class="mono" :text="idText(item)" />
              </span>
              <span class="cell cell--condition">
                <template v-if="!isCard">
                  <ConditionBadge compact :condition="item.condition" />
                  <UiClipText :text="CONDITION_LABEL[item.condition]" />
                </template>
                <span v-else class="muted">—</span>
              </span>
              <span v-if="showOwner" class="cell cell--owner">
                <UiClipText :text="ownerText(item)" :tip="ownerTip(item)" />
              </span>
              <span class="cell cell--actions" @click.stop>
                <button
                  v-if="canAcceptTransfer(auth, item, transfers)"
                  type="button"
                  class="link link--accent"
                  :disabled="store.busy"
                  @click="store.acceptTransfer(item.id)"
                >
                  Принять
                </button>
                <button
                  v-else-if="canCancelPendingTransfer(auth, item, transfers)"
                  type="button"
                  class="link"
                  :disabled="store.busy"
                  @click="store.cancelTransfer(item.id)"
                >
                  Отменить
                </button>
                <button
                  v-else-if="canTransferItem(auth, item, transfers)"
                  type="button"
                  class="link"
                  @click="openTransfer([item])"
                >
                  Передать
                </button>
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
    </template>

    <EquipmentCardDialog
      :item-id="detailId"
      @close="detailId = null"
      @transfer="openTransfer([$event])"
      @edit="editItem = $event"
      @remark="remarkItem = $event"
    />
    <TransferDialog :open="isTransferOpen" :items="transferItems" @close="isTransferOpen = false" @saved="onTransferred" />
    <EquipmentFormDialog
      :open="Boolean(editItem)"
      :category="editItem?.category ?? category"
      :item="editItem"
      @close="editItem = null"
    />
    <FillRemarkDialog :open="Boolean(remarkItem)" :item="remarkItem" @close="remarkItem = null" />
  </div>
</template>

<style scoped>
.board {
  gap: var(--space-3);
  min-width: 0;
  max-width: 100%;
  overflow-x: clip;
}

.board__chrome {
  display: grid;
  gap: var(--space-2);
}

.toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 10rem) auto;
  gap: var(--space-2);
  align-items: center;
  min-width: 0;
}

.toolbar__search,
.toolbar__select {
  width: 100%;
  min-width: 0;
}

.toolbar__count {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.selection {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  background: var(--surface-inverse);
  color: var(--text-on-inverse);
  font-size: var(--font-size-sm);
  box-shadow: var(--shadow-raised);
  outline: 1px solid var(--border-inverse-edge);
  outline-offset: -1px;
}

.selection__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  max-width: 100%;
}

.selection__actions :deep(.btn--ghost) {
  border-color: var(--border-inverse-strong);
  background: transparent;
  color: var(--text-on-inverse);
}

.list {
  flex: 1 1 auto;
  min-width: 0;
  min-height: calc(var(--control-height) * 6);
  max-width: 100%;
  overflow-x: clip;
}

.rows {
  --check-col: var(--tap-size);
  --name-col: minmax(6rem, 2.2fr);
  --id-col: minmax(3.5rem, 0.9fr);
  --condition-col: minmax(4rem, 1fr);
  --owner-col: minmax(4rem, 1.05fr);
  --actions-col: 6.25rem;
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
  grid-template-columns:
    var(--check-col)
    var(--name-col)
    var(--id-col)
    var(--condition-col)
    var(--owner-col)
    var(--actions-col);
  align-items: center;
  gap: var(--space-2);
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  max-height: var(--control-height);
  padding: 0 var(--space-3);
  overflow: hidden;
}

.rows--plain .rows__head,
.rows--plain .rows__item {
  grid-template-columns:
    var(--name-col)
    var(--id-col)
    var(--condition-col)
    var(--owner-col)
    var(--actions-col);
}

.rows--plain .cell--check {
  display: none;
}

.rows--no-owner .rows__head,
.rows--no-owner .rows__item {
  grid-template-columns:
    var(--check-col)
    var(--name-col)
    var(--id-col)
    var(--condition-col)
    var(--actions-col);
}

.rows--plain.rows--no-owner .rows__head,
.rows--plain.rows--no-owner .rows__item {
  grid-template-columns:
    var(--name-col)
    var(--id-col)
    var(--condition-col)
    var(--actions-col);
}

.rows__head {
  position: sticky;
  top: 0;
  z-index: 1;
  min-height: var(--control-height-sm);
  max-height: var(--control-height);
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
  min-height: var(--control-height);
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

.rows__item[data-state='fix'] {
  background: var(--status-bad-bg);
  box-shadow: inset 3px 0 0 var(--status-bad-solid);
}

.rows__item[data-state='review'] {
  box-shadow: inset 3px 0 0 var(--accent);
}

.rows__item--selected:not([data-state='fix']) {
  background: var(--row-selected-bg);
}

.cell {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-width: 3.5rem;
  max-width: 100%;
  max-height: 100%;
  overflow: hidden;
}

.cell--name {
  min-width: 6rem;
  max-width: 100%;
}

.rows__head .cell {
  white-space: nowrap;
}

.cell--id {
  min-width: 3.5rem;
  max-width: 8rem;
}

.cell--condition {
  min-width: 4rem;
  max-width: 9rem;
}

.cell--owner {
  min-width: 4rem;
  max-width: 10rem;
}

.cell--check {
  justify-content: center;
  min-width: var(--check-col);
  max-width: var(--check-col);
}

.cell--actions {
  justify-content: flex-end;
  min-width: 5.5rem;
  max-width: var(--actions-col);
}

.cell--check input {
  width: 20px;
  height: 20px;
  margin: 0;
  accent-color: var(--accent-strong);
  cursor: pointer;
}

.name {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 600;
}

.pending {
  flex: 0 1 8rem;
  min-width: 0;
  max-width: 8rem;
  color: var(--status-warn-fg);
  font-size: var(--font-size-xs);
  font-weight: 600;
}

.mono {
  font-variant-numeric: tabular-nums;
}

.muted {
  color: var(--text-secondary);
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

.link--accent {
  background: var(--accent-strong);
  color: var(--text-on-accent);
}

.link:disabled {
  color: var(--text-disabled);
  cursor: not-allowed;
}

.link--accent:disabled {
  background: var(--surface-sunken);
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
  }

  .rows__item:hover:not([data-state='fix']):not(.rows__item--selected) {
    background: var(--row-hover-bg);
  }

  .link:not(:disabled):hover {
    background: var(--accent-subtle);
  }

  .link--accent:not(:disabled):hover {
    background: var(--accent-strong-hover);
  }

  .selection__actions :deep(.btn--ghost:hover) {
    background: var(--surface-inverse-hover);
    color: var(--text-on-inverse);
  }

  .scroll-top:hover {
    border-color: var(--border-strong);
  }
}

@media (max-width: 860px) {
  .toolbar {
    grid-template-columns: minmax(0, 1fr);
  }

  .toolbar__select {
    order: -1;
  }

  .toolbar__count {
    display: none;
  }

  .rows {
    --name-col: minmax(4.5rem, 2.2fr);
    --id-col: minmax(3rem, 0.9fr);
    --condition-col: 1.5rem;
    --owner-col: minmax(3rem, 1.05fr);
    --actions-col: 5.75rem;
    border: 0;
    background: none;
    overflow: visible;
  }

  .rows__head {
    display: none;
  }

  .rows__head,
  .rows__item {
    gap: var(--space-1);
    padding: 0 var(--space-2);
  }

  .rows__item {
    margin-bottom: var(--space-1);
    border: 1px solid var(--border-subtle);
    border-top-color: var(--border-subtle);
    border-radius: var(--radius);
    background: var(--surface-card);
  }

  .rows__list .rows__item:first-child {
    border-top: 1px solid var(--border-subtle);
  }

  .rows__head {
    padding-left: var(--space-2);
    background: var(--surface-app);
  }

  .pending {
    display: none;
  }

  .cell--condition :deep(.clip-text) {
    display: none;
  }

  .cell--name {
    min-width: 4.5rem;
  }

  .cell--id,
  .cell--owner {
    min-width: 3rem;
  }

  .cell--condition {
    min-width: 1.5rem;
    max-width: 1.5rem;
    justify-content: center;
  }

  .cell--actions :deep(.btn),
  .link {
    min-height: var(--tap-size);
  }
}

@media (max-width: 560px) {
  .rows {
    --actions-col: 5.5rem;
  }

  .selection {
    padding: var(--space-2) var(--space-3);
  }

  .selection__actions {
    width: 100%;
  }

  .selection__actions :deep(.btn) {
    flex: 1 1 auto;
    min-height: var(--tap-size);
  }
}

@media (forced-colors: active) {
  .selection {
    border: 1px solid CanvasText;
  }
}
</style>
