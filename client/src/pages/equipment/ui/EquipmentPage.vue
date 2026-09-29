<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import {
  CONDITION_LABEL,
  CONDITION_OPTIONS,
  TRANSFER_STATUS_LABEL,
  TYPE_LABEL,
  canAcceptTransfer,
  canCancelPendingTransfer,
  canChangeCondition,
  canCreate,
  canTransferItem,
  conditionTone,
  isFillBlocked,
  isPendingAccept,
  pendingTransfer,
  useEquipmentStore,
  type EquipmentCondition,
  type EquipmentItem,
} from '@/entities/equipment'
import { EquipmentFormDialog } from '@/features/equipment-form'
import { TransferDialog } from '@/features/equipment-transfer'
import { UiButton, UiState } from '@/shared/ui'

type TabId = 'list' | 'bases' | 'transfers'

const store = useEquipmentStore()
const {
  filteredItems,
  status,
  errorMessage,
  query,
  typeFilter,
  conditionFilter,
  selectedItem,
  warehouses,
  transfers,
  pendingIncoming,
  isEmpty,
  auth,
} = storeToRefs(store)

const tab = ref<TabId>('list')
const createOpen = ref(false)
const transferOpen = ref(false)
const transferItem = ref<EquipmentItem | null>(null)
const selectedWarehouseId = ref<string | null>(null)

onMounted(() => {
  void store.load()
})

watch(
  warehouses,
  (list) => {
    if (!selectedWarehouseId.value && list[0]) selectedWarehouseId.value = list[0].id
  },
  { immediate: true },
)

const selectedWarehouse = computed(
  () => warehouses.value.find((w) => w.id === selectedWarehouseId.value) ?? null,
)

const warehouseItems = computed(() =>
  selectedWarehouseId.value ? store.itemsOnWarehouse(selectedWarehouseId.value) : [],
)

const sortedTransfers = computed(() =>
  [...transfers.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
)

function openTransfer(item: EquipmentItem) {
  transferItem.value = item
  transferOpen.value = true
}

async function onConditionChange(item: EquipmentItem, event: Event) {
  const value = (event.target as HTMLSelectElement).value as EquipmentCondition
  try {
    await store.updateCondition(item.id, value)
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Ошибка')
  }
}

async function accept(item: EquipmentItem) {
  try {
    await store.acceptTransfer(item.id)
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Ошибка')
  }
}

async function cancel(item: EquipmentItem) {
  try {
    await store.cancelTransfer(item.id)
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Ошибка')
  }
}

function pendingLabel(item: EquipmentItem) {
  const pending = pendingTransfer(item, transfers.value)
  return pending ? `→ ${pending.toLabel}` : ''
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>Оборудование</h1>
        <p>
          Учёт серийных и неномерных позиций, базы и передачи. Демо-персона:
          <strong>{{ auth.user.fullName }}</strong>
        </p>
      </div>
      <div class="page__actions">
        <UiButton
          v-if="canCreate(auth)"
          variant="primary"
          @click="createOpen = true"
        >
          Добавить
        </UiButton>
      </div>
    </header>

    <div class="tabs" role="tablist" aria-label="Разделы оборудования">
      <button
        type="button"
        class="tabs__btn"
        :class="{ 'tabs__btn--active': tab === 'list' }"
        role="tab"
        @click="tab = 'list'"
      >
        Список
      </button>
      <button
        type="button"
        class="tabs__btn"
        :class="{ 'tabs__btn--active': tab === 'bases' }"
        role="tab"
        @click="tab = 'bases'"
      >
        Базы
      </button>
      <button
        type="button"
        class="tabs__btn"
        :class="{ 'tabs__btn--active': tab === 'transfers' }"
        role="tab"
        @click="tab = 'transfers'"
      >
        Передачи
        <span v-if="pendingIncoming.length" class="tabs__badge">{{ pendingIncoming.length }}</span>
      </button>
    </div>

    <UiState
      v-if="status === 'loading'"
      title="Загрузка оборудования…"
      text="Подтягиваем демо-данные из модуля учёта."
    />

    <UiState v-else-if="status === 'error'" title="Не удалось загрузить" :text="errorMessage">
      <UiButton variant="primary" @click="store.load()">Повторить</UiButton>
    </UiState>

    <template v-else>
      <div v-if="pendingIncoming.length && tab !== 'transfers'" class="inbox">
        <strong>Входящие передачи:</strong>
        <span v-for="item in pendingIncoming" :key="item.id" class="inbox__item">
          {{ item.name }}
          <UiButton size="sm" variant="primary" @click="accept(item)">Принять</UiButton>
        </span>
      </div>

      <!-- LIST -->
      <div v-if="tab === 'list'" class="layout">
        <div class="panel">
          <div class="filters">
            <input
              :value="query"
              placeholder="Поиск: название, номер, владелец"
              @input="query = ($event.target as HTMLInputElement).value"
            />
            <select :value="typeFilter" @change="typeFilter = ($event.target as HTMLSelectElement).value as typeof typeFilter">
              <option value="">Все типы</option>
              <option value="SERIAL">Серийное</option>
              <option value="CONSUMABLE">Неномерное</option>
            </select>
            <select
              :value="conditionFilter"
              @change="conditionFilter = ($event.target as HTMLSelectElement).value as typeof conditionFilter"
            >
              <option value="">Все состояния</option>
              <option v-for="opt in CONDITION_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <UiState
            v-if="isEmpty"
            title="Ничего не найдено"
            text="Измените фильтры или добавьте позицию."
          />

          <div v-else class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Тип</th>
                  <th>№ / кол-во</th>
                  <th>Состояние</th>
                  <th>Владелец</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in filteredItems"
                  :key="item.id"
                  :class="{ 'is-selected': item.id === selectedItem?.id }"
                  @click="store.select(item.id)"
                >
                  <td>
                    <strong>{{ item.name }}</strong>
                    <span v-if="isPendingAccept(item, transfers)" class="chip chip--pending">
                      {{ pendingLabel(item) }}
                    </span>
                    <span v-if="isFillBlocked(item)" class="chip chip--warn">На проверке</span>
                  </td>
                  <td>{{ TYPE_LABEL[item.type] }}</td>
                  <td>
                    <template v-if="item.type === 'SERIAL'">{{ item.factoryNumber || '—' }}</template>
                    <template v-else>{{ item.quantity }} шт.</template>
                  </td>
                  <td>
                    <span class="badge" :data-tone="conditionTone(item.condition)">
                      {{ CONDITION_LABEL[item.condition] }}
                    </span>
                  </td>
                  <td>{{ store.labelForOwner(item) }}</td>
                  <td class="row-actions">
                    <button
                      v-if="canTransferItem(auth, item, transfers)"
                      type="button"
                      @click.stop="openTransfer(item)"
                    >
                      Передать
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <aside v-if="selectedItem" class="detail">
          <h2>{{ selectedItem.name }}</h2>
          <dl>
            <div>
              <dt>Тип</dt>
              <dd>{{ TYPE_LABEL[selectedItem.type] }}</dd>
            </div>
            <div>
              <dt>{{ selectedItem.type === 'SERIAL' ? 'Заводской №' : 'Количество' }}</dt>
              <dd>
                {{
                  selectedItem.type === 'SERIAL'
                    ? selectedItem.factoryNumber || '—'
                    : `${selectedItem.quantity} шт.`
                }}
              </dd>
            </div>
            <div>
              <dt>Владелец</dt>
              <dd>{{ store.labelForOwner(selectedItem) }}</dd>
            </div>
            <div>
              <dt>Состояние</dt>
              <dd>
                <select
                  v-if="canChangeCondition(auth, selectedItem, transfers)"
                  :value="selectedItem.condition"
                  @change="onConditionChange(selectedItem, $event)"
                >
                  <option v-for="opt in CONDITION_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
                <span v-else class="badge" :data-tone="conditionTone(selectedItem.condition)">
                  {{ CONDITION_LABEL[selectedItem.condition] }}
                </span>
              </dd>
            </div>
            <div v-if="selectedItem.conditionNote">
              <dt>Комментарий</dt>
              <dd>{{ selectedItem.conditionNote }}</dd>
            </div>
            <div v-if="selectedItem.fillComment">
              <dt>Заполнение</dt>
              <dd class="warn-text">{{ selectedItem.fillComment }}</dd>
            </div>
          </dl>

          <div class="detail__actions">
            <UiButton
              v-if="canTransferItem(auth, selectedItem, transfers)"
              variant="primary"
              @click="openTransfer(selectedItem)"
            >
              Передать
            </UiButton>
            <UiButton
              v-if="canAcceptTransfer(auth, selectedItem, transfers)"
              variant="primary"
              @click="accept(selectedItem)"
            >
              Принять
            </UiButton>
            <UiButton
              v-if="canCancelPendingTransfer(auth, selectedItem, transfers)"
              variant="ghost"
              @click="cancel(selectedItem)"
            >
              Отменить передачу
            </UiButton>
          </div>
        </aside>
      </div>

      <!-- BASES -->
      <div v-else-if="tab === 'bases'" class="layout">
        <aside class="bases-list">
          <button
            v-for="wh in warehouses"
            :key="wh.id"
            type="button"
            class="bases-list__item"
            :class="{ 'bases-list__item--active': wh.id === selectedWarehouseId }"
            @click="selectedWarehouseId = wh.id"
          >
            <strong>{{ wh.name }}</strong>
            <span v-if="wh.isSystem" class="chip chip--repair">Системная</span>
            <span>{{ store.itemsOnWarehouse(wh.id).length }} поз.</span>
            <span v-if="wh.address" class="muted">{{ wh.address }}</span>
          </button>
        </aside>

        <div class="panel">
          <header class="panel__head">
            <h2>{{ selectedWarehouse?.name }}</h2>
            <p v-if="selectedWarehouse?.slug === 'repair'">
              Состояние «В ремонте» автоматически переносит позицию сюда. После ремонта нужно
              передать дальше явно.
            </p>
          </header>

          <UiState
            v-if="!warehouseItems.length"
            title="На базе пусто"
            text="Передайте оборудование на эту базу или создайте позицию."
          />

          <div v-else class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Тип</th>
                  <th>№ / кол-во</th>
                  <th>Состояние</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in warehouseItems" :key="item.id">
                  <td><strong>{{ item.name }}</strong></td>
                  <td>{{ TYPE_LABEL[item.type] }}</td>
                  <td>
                    <template v-if="item.type === 'SERIAL'">{{ item.factoryNumber || '—' }}</template>
                    <template v-else>{{ item.quantity }} шт.</template>
                  </td>
                  <td>
                    <span class="badge" :data-tone="conditionTone(item.condition)">
                      {{ CONDITION_LABEL[item.condition] }}
                    </span>
                  </td>
                  <td class="row-actions">
                    <button
                      v-if="canTransferItem(auth, item, transfers)"
                      type="button"
                      @click="openTransfer(item)"
                    >
                      Передать
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TRANSFERS -->
      <div v-else class="panel">
        <div v-if="pendingIncoming.length" class="inbox inbox--block">
          <strong>Ожидают вашего принятия</strong>
          <div v-for="item in pendingIncoming" :key="item.id" class="inbox__row">
            <div>
              <div>{{ item.name }}</div>
              <div class="muted">{{ pendingLabel(item) }}</div>
            </div>
            <div class="inbox__actions">
              <UiButton size="sm" variant="primary" @click="accept(item)">Принять</UiButton>
              <UiButton
                v-if="canCancelPendingTransfer(auth, item, transfers)"
                size="sm"
                variant="ghost"
                @click="cancel(item)"
              >
                Отменить
              </UiButton>
            </div>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Позиция</th>
                <th>Откуда</th>
                <th>Куда</th>
                <th>Кол-во</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tr in sortedTransfers" :key="tr.id">
                <td>{{ tr.createdAt.slice(0, 10) }}</td>
                <td>
                  <strong>{{ tr.equipmentName }}</strong>
                  <span v-if="tr.factoryNumber" class="muted"> · {{ tr.factoryNumber }}</span>
                </td>
                <td>{{ tr.fromLabel }}</td>
                <td>{{ tr.toLabel }}</td>
                <td>{{ tr.quantity }}</td>
                <td>
                  <span
                    class="badge"
                    :data-tone="
                      tr.status === 'PENDING' ? 'warn' : tr.status === 'COMPLETED' ? 'ok' : 'bad'
                    "
                  >
                    {{ TRANSFER_STATUS_LABEL[tr.status] }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <EquipmentFormDialog :open="createOpen" @close="createOpen = false" @saved="() => {}" />
    <TransferDialog
      :open="transferOpen"
      :item="transferItem"
      @close="transferOpen = false"
      @saved="() => {}"
    />
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
  gap: 1rem;
  align-items: flex-start;
  flex-wrap: wrap;
}

.page__header h1 {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--midnight);
}

.page__header p {
  margin: 0.35rem 0 0;
  color: var(--muted);
  max-width: 62ch;
  line-height: 1.45;
}

.page__actions {
  display: flex;
  gap: 8px;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  width: fit-content;
  max-width: 100%;
}

.tabs__btn {
  border: 0;
  background: transparent;
  color: var(--muted);
  min-height: var(--control-height-sm);
  padding: 0 14px;
  border-radius: var(--radius);
  font-size: var(--font-size-sm);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.tabs__btn--active {
  background: var(--midnight);
  color: var(--paper);
}

.tabs__badge {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--radius);
  background: var(--dodger);
  color: var(--paper);
  font-size: 11px;
}

.inbox {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  align-items: center;
  padding: 12px 14px;
  background: var(--row-selected);
  border: 1px solid rgb(0 136 255 / 25%);
  border-radius: var(--radius);
}

.inbox--block {
  flex-direction: column;
  align-items: stretch;
  margin-bottom: 12px;
}

.inbox__item,
.inbox__row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.inbox__row {
  justify-content: space-between;
  padding-top: 8px;
  border-top: 1px solid rgb(0 136 255 / 18%);
}

.inbox__actions {
  display: flex;
  gap: 6px;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 320px);
  gap: 12px;
  min-height: 0;
}

.panel {
  min-width: 0;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 12px;
  box-shadow: var(--shadow-card);
}

.panel__head h2 {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.panel__head p {
  margin: 8px 0 14px;
  color: var(--muted);
  font-size: var(--font-size-sm);
  line-height: 1.45;
}

.filters {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) repeat(2, minmax(120px, 0.7fr));
  gap: 8px;
  margin-bottom: 12px;
}

.filters input,
.filters select,
.detail select {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  min-height: var(--control-height-sm);
  padding: 0 10px;
  background: var(--white-smoke);
  width: 100%;
}

.table-wrap {
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  font-size: var(--font-size-md);
  vertical-align: middle;
}

th {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  background: var(--table-head);
  position: sticky;
  top: 0;
}

tbody tr {
  cursor: pointer;
}

tbody tr:hover {
  background: var(--row-hover);
}

tbody tr.is-selected {
  background: var(--row-selected);
}

.badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: var(--radius);
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.badge[data-tone='ok'] {
  background: var(--ok-bg);
  color: var(--ok);
}

.badge[data-tone='warn'] {
  background: var(--warn-bg);
  color: var(--warn-text);
}

.badge[data-tone='repair'] {
  background: #e8eef8;
  color: var(--steel);
}

.badge[data-tone='bad'] {
  background: var(--bad-bg);
  color: var(--bad);
}

.chip {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 6px;
  border-radius: var(--radius);
  font-size: 11px;
  font-weight: 700;
}

.chip--pending {
  background: var(--warn-bg);
  color: var(--warn-text);
}

.chip--warn {
  background: var(--bad-bg);
  color: var(--bad);
}

.chip--repair {
  background: #e8eef8;
  color: var(--steel);
  margin-left: 0;
  width: fit-content;
}

.row-actions button {
  border: 0;
  background: transparent;
  color: var(--dodger);
  font-weight: 700;
  font-size: var(--font-size-sm);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  padding: 0;
}

.detail {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 16px;
  box-shadow: var(--shadow-card);
  align-self: start;
}

.detail h2 {
  margin: 0 0 14px;
  font-size: var(--font-size-lg);
  font-weight: 700;
}

.detail dl {
  margin: 0;
  display: grid;
  gap: 12px;
}

.detail dt {
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.detail dd {
  margin: 4px 0 0;
}

.detail__actions {
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.warn-text {
  color: var(--bad);
}

.bases-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bases-list__item {
  text-align: left;
  border: 1px solid var(--line);
  background: var(--paper);
  border-radius: var(--radius);
  padding: 12px 14px;
  cursor: pointer;
  display: grid;
  gap: 4px;
  box-shadow: var(--shadow-card);
}

.bases-list__item strong {
  font-size: var(--font-size-md);
}

.bases-list__item span {
  font-size: var(--font-size-sm);
  color: var(--muted);
}

.bases-list__item--active {
  border-color: var(--dodger);
  background: var(--row-selected);
  box-shadow: 0 0 0 2px rgb(0 136 255 / 18%);
}

.muted {
  color: var(--muted);
}

@media (max-width: 860px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .filters {
    grid-template-columns: 1fr;
  }

  .bases-list {
    flex-direction: row;
    overflow-x: auto;
  }

  .bases-list__item {
    min-width: 180px;
  }
}
</style>
