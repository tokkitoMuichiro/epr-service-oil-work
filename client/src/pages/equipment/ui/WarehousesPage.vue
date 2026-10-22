<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useEquipmentRouteName } from '@/shared/lib/equipment-routes'
import {
  CATEGORY_LABEL,
  canManageWarehouses,
  pendingTransfer,
  positionsLabel,
  useEquipmentStore,
  type AssetCategory,
  type Warehouse,
} from '@/entities/equipment'
import { WarehouseFormDialog } from '@/features/warehouse-form'
import { shortFullName } from '@shared/person-name'
import { useMobilePagination } from '@/shared/lib/pagination'
import { IconClose, IconEquipment, UiButton, UiClipText, UiPagination, UiState, askConfirm } from '@/shared/ui'
import EquipmentExportMenu from './EquipmentExportMenu.vue'

const store = useEquipmentStore()
const { nameOf } = useEquipmentRouteName()

const isFormOpen = ref(false)
const editing = ref<Warehouse | null>(null)
const canManage = computed(() => canManageWarehouses(store.auth))
const categories: AssetCategory[] = ['EQUIPMENT', 'VEHICLE', 'CARD']

const bases = computed(() =>
  [...store.warehouses].sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name, 'ru')),
)

const pager = useMobilePagination(bases)

function countOn(id: string, category: AssetCategory) {
  return store.itemsOnWarehouse(id).filter((i) => i.category === category).length
}

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
        <EquipmentExportMenu />
        <UiButton v-if="canManage" variant="primary" @click="openForm(null)">Новая база</UiButton>
      </div>
    </div>

    <p v-if="store.actionError && !isFormOpen" class="alert ui-fill-chrome" role="alert">
      {{ store.actionError }}
      <button type="button" aria-label="Скрыть" @click="store.clearActionError()"><IconClose :size="16" /></button>
    </p>

    <UiState v-if="!bases.length" title="Баз пока нет" :icon="IconEquipment" text="Создайте первую производственную базу." />

    <div v-else class="panel ui-fill-panel">
      <div :ref="pager.bindFit" class="table-wrap ui-table-wrap ui-table-wrap--stack ui-fill-scroll">
        <table class="ui-table bases-table">
          <thead>
            <tr>
              <th class="col-name">Название</th>
              <th class="col-address ui-hide-mobile">Адрес</th>
              <th class="col-keepers">Кладовщики</th>
              <th v-for="c in categories" :key="c" class="col-count num ui-hide-mobile">{{ CATEGORY_LABEL[c] }}</th>
              <th class="col-total num">Всего</th>
              <th v-if="canManage" class="col-actions"><span class="sr-only">Действия</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="w in pager.pageItems" :key="w.id" :class="{ 'row--system': w.isSystem }">
              <td class="col-name ui-cell--main">
                <RouterLink class="base-link" :to="{ name: nameOf('equipment-warehouse'), params: { id: w.id } }">
                  <UiClipText tag="strong" :text="w.name" />
                </RouterLink>
                <span v-if="w.isSystem" class="tag ui-badge ui-badge--info">Системная</span>
                <span v-if="isMine(w)" class="tag ui-badge ui-badge--ok">Ваша база</span>
                <span v-if="incomingTo(w.id)" class="tag ui-badge ui-badge--warn">Входящих: {{ incomingTo(w.id) }}</span>
              </td>
              <td class="col-address ui-hide-mobile">
                <UiClipText :text="w.address || '—'" />
              </td>
              <td class="col-keepers" data-label="Кладовщики">
                <UiClipText :text="keepersOf(w)" />
              </td>
              <td v-for="c in categories" :key="c" class="col-count num ui-hide-mobile" :data-label="CATEGORY_LABEL[c]">
                {{ countOn(w.id, c) }}
              </td>
              <td class="col-total num ui-cell--aside" data-label="Всего">
                {{ positionsLabel(store.itemsOnWarehouse(w.id).length) }}
              </td>
              <td v-if="canManage" class="col-actions ui-cell--actions">
                <UiButton size="sm" variant="ghost" @click="openForm(w)">Изменить</UiButton>
                <UiButton v-if="!w.isSystem" size="sm" variant="ghost" :disabled="store.busy" @click="remove(w)">
                  Удалить
                </UiButton>
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

.bases-table {
  table-layout: auto;
  width: 100%;
}

.col-name {
  width: 100%;
}

.col-address,
.col-keepers,
.col-count,
.col-total,
.col-actions {
  width: 1%;
  white-space: nowrap;
}

.col-address {
  max-width: 14rem;
}

.col-keepers {
  max-width: 12rem;
}

.base-link {
  display: block;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.col-name .tag {
  margin-left: var(--space-2);
  vertical-align: middle;
}

.row--system td:first-child {
  box-shadow: inset 3px 0 0 var(--accent);
}

.col-total {
  font-weight: 600;
  color: var(--text-link);
}

@media (max-width: 860px) {
  .bases-table {
    table-layout: auto;
  }

  .col-name,
  .col-address,
  .col-keepers,
  .col-count,
  .col-total,
  .col-actions {
    width: auto;
  }

  .col-name .tag {
    margin-left: 0;
    margin-right: var(--space-1);
  }

  .col-actions :deep(.btn) {
    flex: 1 1 auto;
  }
}
</style>
