<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  CARD_KIND_OPTIONS,
  CONDITION_OPTIONS,
  ConditionBadge,
  FILL_STATUS_LABEL,
  VEHICLE_KIND_OPTIONS,
  assetDisplayName,
  canAcceptTransfer,
  canCancelPendingTransfer,
  canTransferItem,
  equipmentTypeLabel,
  identityLabel,
  identityTitle,
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
import { formatDateTimeRu } from '@/shared/lib/date'
import { IconClose, UiButton, UiState } from '@/shared/ui'
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

const query = ref('')
const kindFilter = ref('')
const selectedIds = ref<string[]>([])
const detailId = ref<string | null>(null)
const transferItems = ref<EquipmentItem[]>([])
const isTransferOpen = ref(false)
const editItem = ref<EquipmentItem | null>(null)
const remarkItem = ref<EquipmentItem | null>(null)

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

const selectable = computed(() => visible.value.filter((i) => canTransferItem(auth.value, i, transfers.value)))
const selectedItems = computed(() => store.items.filter((i) => selectedIds.value.includes(i.id)))
const isAllSelected = computed(
  () => selectable.value.length > 0 && selectable.value.every((i) => selectedIds.value.includes(i.id)),
)
const isAnyDialogOpen = computed(
  () => Boolean(detailId.value || isTransferOpen.value || editItem.value || remarkItem.value),
)

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
</script>

<template>
  <div class="board">
    <div class="toolbar">
      <input v-model="query" class="toolbar__search ui-control" type="search" :placeholder="searchPlaceholder" aria-label="Поиск" />
      <select v-model="kindFilter" class="toolbar__select ui-control" :aria-label="kindPlaceholder">
        <option value="">{{ kindPlaceholder }}</option>
        <option v-for="opt in kindOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <span class="toolbar__count">{{ positionsLabel(visible.length) }}</span>
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
      <div class="table-wrap ui-table-wrap">
        <table class="ui-table">
          <thead>
            <tr>
              <th class="col-check">
                <input
                  v-if="selectable.length"
                  type="checkbox"
                  :checked="isAllSelected"
                  aria-label="Выбрать все доступные для передачи"
                  @change="toggleAll"
                />
              </th>
              <th>Наименование</th>
              <th>{{ category === 'EQUIPMENT' ? 'Тип' : category === 'VEHICLE' ? 'Вид' : 'Тип карты' }}</th>
              <th>{{ category === 'EQUIPMENT' ? '№ / кол-во' : identityTitle(category) }}</th>
              <th v-if="!isCard">Состояние</th>
              <th v-if="showOwner">Владелец</th>
              <th v-if="showRepairSender">Отправил в ремонт</th>
              <th class="col-actions"><span class="sr-only">Действия</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in visible" :key="item.id" :data-state="rowState(item)" @click="detailId = item.id">
              <td class="col-check" @click.stop>
                <input
                  v-if="canTransferItem(auth, item, transfers)"
                  type="checkbox"
                  :checked="isSelected(item)"
                  :aria-label="`Выбрать ${item.name}`"
                  @change="toggle(item)"
                />
              </td>
              <td>
                <div class="name">
                  <strong>{{ item.name }}</strong>
                  <span v-if="item.fillStatus !== 'OK'" class="chip ui-badge" :class="item.fillStatus === 'NEEDS_FIX' ? 'ui-badge--bad' : 'ui-badge--info'" :data-tone="item.fillStatus">
                    {{ FILL_STATUS_LABEL[item.fillStatus] }}
                  </span>
                  <span v-if="isPendingAccept(item, transfers)" class="chip ui-badge ui-badge--warn" data-tone="pending">
                    {{ pendingOfferLabel(item, transfers) }}
                  </span>
                  <span v-if="item.hasDocuments" class="chip ui-badge ui-badge--neutral" data-tone="docs" title="Есть документы">Док.</span>
                </div>
                <small v-if="item.conditionNote" class="note">{{ item.conditionNote }}</small>
              </td>
              <td>{{ equipmentTypeLabel(item) }}</td>
              <td class="mono">{{ item.type === 'CONSUMABLE' ? `${item.quantity} шт.` : identityLabel(item) }}</td>
              <td v-if="!isCard"><ConditionBadge :condition="item.condition" /></td>
              <td v-if="showOwner">{{ store.labelForOwner(item) }}</td>
              <td v-if="showRepairSender">
                <template v-if="origin(item)">
                  <div>{{ origin(item)?.by }}</div>
                  <small class="note">{{ origin(item)?.from }} · {{ formatDateTimeRu(origin(item)?.at) }}</small>
                </template>
                <span v-else class="note">—</span>
              </td>
              <td class="col-actions" @click.stop>
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
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ul class="cards">
        <li v-for="item in visible" :key="item.id" class="cards__item" :data-state="rowState(item)" @click="detailId = item.id">
          <div class="cards__head">
            <label v-if="canTransferItem(auth, item, transfers)" class="check" @click.stop>
              <input type="checkbox" :checked="isSelected(item)" :aria-label="`Выбрать ${item.name}`" @change="toggle(item)" />
            </label>
            <strong>{{ assetDisplayName(item) }}</strong>
            <ConditionBadge v-if="!isCard" :condition="item.condition" />
          </div>
          <div class="cards__meta">
            <span>{{ equipmentTypeLabel(item) }}</span>
            <span class="mono">{{ item.type === 'CONSUMABLE' ? `${item.quantity} шт.` : identityLabel(item) }}</span>
            <span v-if="showOwner">{{ store.labelForOwner(item) }}</span>
          </div>
          <div v-if="item.fillStatus !== 'OK' || isPendingAccept(item, transfers)" class="name">
            <span v-if="item.fillStatus !== 'OK'" class="chip ui-badge" :class="item.fillStatus === 'NEEDS_FIX' ? 'ui-badge--bad' : 'ui-badge--info'" :data-tone="item.fillStatus">
              {{ FILL_STATUS_LABEL[item.fillStatus] }}
            </span>
            <span v-if="isPendingAccept(item, transfers)" class="chip ui-badge ui-badge--warn" data-tone="pending">
              {{ pendingOfferLabel(item, transfers) }}
            </span>
          </div>
          <small v-if="showRepairSender && origin(item)" class="note">
            Отправил: {{ origin(item)?.by }} ({{ origin(item)?.from }})
          </small>
          <div class="cards__actions" @click.stop>
            <UiButton
              v-if="canAcceptTransfer(auth, item, transfers)"
              size="sm"
              variant="primary"
              :disabled="store.busy"
              @click="store.acceptTransfer(item.id)"
            >
              Принять
            </UiButton>
            <UiButton
              v-else-if="canTransferItem(auth, item, transfers)"
              size="sm"
              variant="ghost"
              @click="openTransfer([item])"
            >
              Передать
            </UiButton>
          </div>
        </li>
      </ul>
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
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}

.toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(160px, 0.8fr) auto;
  gap: var(--space-2);
  align-items: center;
}

.toolbar__search,
.toolbar__select {
  width: 100%;
}

.toolbar__count {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.selection {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
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
  gap: var(--space-2);
}

.selection__actions :deep(.btn--ghost) {
  border-color: var(--border-inverse-strong);
  background: transparent;
  color: var(--text-on-inverse);
}

.table-wrap {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}

.ui-table td {
  font-size: var(--font-size-sm);
  background-color: var(--surface-card);
}

tbody tr {
  cursor: pointer;
}

tr[data-state='pending'] td,
.cards__item[data-state='pending'] {
  background-color: var(--status-warn-bg);
}

tr[data-state='fix'] td,
.cards__item[data-state='fix'] {
  background-color: var(--status-bad-bg);
}

tr[data-state='review'] td,
.cards__item[data-state='review'] {
  background-color: var(--status-info-bg);
}

tr[data-state='pending'] td:first-child,
.cards__item[data-state='pending'] {
  box-shadow: inset 3px 0 0 var(--status-warn-solid);
}

tr[data-state='fix'] td:first-child,
.cards__item[data-state='fix'] {
  box-shadow: inset 3px 0 0 var(--status-bad-solid);
}

tr[data-state='review'] td:first-child,
.cards__item[data-state='review'] {
  box-shadow: inset 3px 0 0 var(--accent);
}

.col-check {
  width: 44px;
  padding-right: 0;
}

.col-check input,
.check input {
  width: 20px;
  height: 20px;
  margin: 0;
  accent-color: var(--accent-strong);
  cursor: pointer;
}

.col-actions {
  width: 1%;
  white-space: nowrap;
  text-align: right;
}

.name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.name strong {
  font-weight: 600;
}

.note {
  display: block;
  margin-top: 2px;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.mono {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.link {
  min-height: 36px;
  padding: 0 var(--space-2);
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-link);
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
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

@media (hover: hover) and (pointer: fine) {
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
}

.cards {
  display: none;
  margin: 0;
  padding: 0;
  list-style: none;
  gap: var(--space-2);
}

.cards__item {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  background: var(--surface-card);
  cursor: pointer;
}

.cards__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-size);
}

.cards__head strong {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}

.check {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: var(--tap-size);
  height: var(--tap-size);
  margin: calc(-1 * var(--space-2)) 0 calc(-1 * var(--space-2)) calc(-1 * var(--space-3));
  cursor: pointer;
}

.check input {
  width: 24px;
  height: 24px;
}

.cards__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.cards__actions {
  display: flex;
}

.cards__actions :deep(.btn) {
  flex: 1 1 auto;
  min-height: var(--tap-size);
}

.cards__actions:empty {
  display: none;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

@media (max-width: 860px) {
  .toolbar {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .toolbar__search {
    grid-column: 1 / -1;
  }

  .toolbar__count {
    justify-self: end;
  }
}

@media (max-width: 560px) {
  .toolbar {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .table-wrap {
    display: none;
  }

  .cards {
    display: grid;
  }

  .selection {
    padding: var(--space-3);
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